-- 複数 Google アカウント対応とエンタイトルメント(CAP-3, CAP-2)。
--
-- 機能:
--   - entitlements テーブル: ユーザーの有料機能の権利を管理。RevenueCat Webhook で更新。
--   - connections に status: 'active' / 'suspended' で失効時に接続を止める。
--   - 接続上限: 無料ユーザー=1、multi_account 契約=5(仮置き)。
--   - 複数アカウント対応: (user_id, provider, google_email) で重複排除。
--   - 自動調整: reconcile_google_connections で接続数を上限に合わせる。

-- ── entitlements: ユーザーの有料機能の権利 ───────────────────────────────────────

create table public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null check (entitlement in ('calendar_write', 'multi_account')),
  expires_at timestamptz, -- null は無期限。
  product_id text,
  store text,
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement)
);

comment on table public.entitlements is
  '有料機能の権利。user_id + entitlement で主キー。expires_at が null または未来なら有効。RevenueCat Webhook で更新。';
comment on column public.entitlements.expires_at is
  '権利の有効期限。null は無期限。この列がnullまたはnow()より後なら有効。';
comment on column public.entitlements.product_id is
  'RevenueCat の product_id(例: calendar_write_monthly)。';
comment on column public.entitlements.store is
  'ストア(例: google_play, app_store)。';

create index entitlements_expires_at_idx on public.entitlements (user_id, expires_at);

alter table public.entitlements enable row level security;

-- SELECT のみ。書き込みはservice_role(Webhook処理)。
create policy "entitlements_select_own"
  on public.entitlements for select
  using (user_id = (select auth.uid()));

-- ── connections: status カラム追加、インデックス変更 ───────────────────────────

alter table public.connections
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended'));

comment on column public.connections.status is
  '''active'' / ''suspended''。suspended は接続を一時停止(取り込み・反映停止、データ保持)。';

-- 既存インデックス connections_one_active_per_user を削除(複数接続対応のため)。
drop index if exists public.connections_one_active_per_user;

-- 新: 同一ユーザー・同一Googleメール(大文字小文字無視)・未削除・未削除の接続を1つまで。
create unique index connections_one_per_email_active
  on public.connections (user_id, provider, lower(coalesce(google_email, '')))
  where deleted_at is null and google_email is not null;

-- ── 接続上限計算: get_google_connection_limit ──────────────────────────────────

-- 有効な multi_account 権利があれば5、なければ1を返す。
create or replace function public.get_google_connection_limit(p_user_id uuid)
returns int
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
    when exists (
      select 1 from public.entitlements
      where user_id = p_user_id
        and entitlement = 'multi_account'
        and (expires_at is null or expires_at > now())
    ) then 5
    else 1
  end;
$$;

revoke execute on function public.get_google_connection_limit(uuid) from public, anon, authenticated;
grant execute on function public.get_google_connection_limit(uuid) to service_role;

comment on function public.get_google_connection_limit(uuid) is
  '有効な multi_account 権利があれば5、なければ1。service_role専用。';

-- ── 接続の自動調整: reconcile_google_connections ────────────────────────────────

-- 未削除の接続を created_at 昇順でソート、上限以内は status='active'、超過分は 'suspended'。
create or replace function public.reconcile_google_connections(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_limit int;
  v_active_count int;
begin
  v_limit := public.get_google_connection_limit(p_user_id);

  -- 未削除の接続数(created_at昇順)を上限と比較。
  -- 上位 v_limit 件を active、超過分を suspended に更新。
  with ranked as (
    select id,
           row_number() over (order by created_at asc) as rank
      from public.connections
     where user_id = p_user_id
       and deleted_at is null
  )
  update public.connections c
    set status = case when r.rank <= v_limit then 'active' else 'suspended' end,
        updated_at = now()
    from ranked r
   where c.id = r.id
     and c.status is distinct from case when r.rank <= v_limit then 'active' else 'suspended' end;
end;
$$;

revoke execute on function public.reconcile_google_connections(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_google_connections(uuid) to service_role;

comment on function public.reconcile_google_connections(uuid) is
  '未削除の接続を created_at 昇順でソート、上限以内を active、超過分を suspended に更新。service_role専用。';

-- ── upsert_google_connection: 複数接続対応に置き換え ─────────────────────────────

-- 同じユーザー・同じメール(大文字小文字無視)の未削除接続があれば refresh_token 更新・再利用(status は reconcile に任せる)。
-- なければ上限確認。未削除接続数が上限以上なら例外投げ、なければ新規作成。
-- google_email が null の場合は従来「未削除あれば更新、なければ作成」の挙動(メール取得失敗時の無限増殖回避)。
-- 実行後に reconcile を呼ぶ。

create or replace function public.upsert_google_connection(
  p_user_id uuid,
  p_refresh_token text,
  p_google_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_conn_id uuid;
  v_old_secret_id uuid;
  v_new_secret_id uuid;
  v_limit int;
  v_current_count int;
begin
  -- ユーザーの存在確認(delete中の競合回避)。
  perform 1 from auth.users where id = p_user_id for key share;
  if not found then
    raise exception 'user does not exist' using errcode = '23503';
  end if;

  v_new_secret_id := vault.create_secret(
    p_refresh_token,
    'google_refresh_' || gen_random_uuid()::text,
    'Google Calendar refresh token'
  );

  -- google_email が指定されている場合、同一メール(大文字小文字無視)の接続を探す。
  if p_google_email is not null then
    select id, vault_secret_id
      into v_conn_id, v_old_secret_id
      from public.connections
     where user_id = p_user_id
       and provider = 'google'
       and lower(coalesce(google_email, '')) = lower(coalesce(p_google_email, ''))
       and deleted_at is null;

    if v_conn_id is not null then
      -- 既存の接続を再利用(refresh_token更新、status は reconcile に任せる)。
      update public.connections
        set vault_secret_id = v_new_secret_id,
            google_email = p_google_email,
            updated_at = now()
        where id = v_conn_id;
      if v_old_secret_id is not null then
        delete from vault.secrets where id = v_old_secret_id;
      end if;
    else
      -- 新規接続を作成する前に上限確認。
      v_limit := public.get_google_connection_limit(p_user_id);
      select count(*)
        into v_current_count
        from public.connections
       where user_id = p_user_id
         and deleted_at is null;

      if v_current_count >= v_limit then
        -- Vault の新規 secret は作成してしまったので削除。
        delete from vault.secrets where id = v_new_secret_id;
        raise exception 'connection_limit_reached'
          using errcode = '42601';
      end if;

      -- 新規作成。
      insert into public.connections (user_id, provider, google_email, vault_secret_id, status)
        values (p_user_id, 'google', p_google_email, v_new_secret_id, 'active')
        returning id into v_conn_id;
    end if;
  else
    -- google_email が null(メール取得失敗時)の従来の挙動。
    -- 未削除の接続があれば更新、なければ新規作成。
    select id, vault_secret_id
      into v_conn_id, v_old_secret_id
      from public.connections
     where user_id = p_user_id
       and provider = 'google'
       and deleted_at is null;

    if v_conn_id is not null then
      update public.connections
        set vault_secret_id = v_new_secret_id,
            google_email = p_google_email,
            updated_at = now()
        where id = v_conn_id;
      if v_old_secret_id is not null then
        delete from vault.secrets where id = v_old_secret_id;
      end if;
    else
      insert into public.connections (user_id, provider, google_email, vault_secret_id, status)
        values (p_user_id, 'google', p_google_email, v_new_secret_id, 'active')
        returning id into v_conn_id;
    end if;
  end if;

  -- 接続を上限に合わせて調整(status更新)。
  perform public.reconcile_google_connections(p_user_id);

  return v_conn_id;
end;
$$;

revoke execute on function public.upsert_google_connection(uuid, text, text) from public, anon, authenticated;
grant execute on function public.upsert_google_connection(uuid, text, text) to service_role;

comment on function public.upsert_google_connection(uuid, text, text) is
  'oauth-exchange専用。複数接続対応。同じメール(大文字小文字無視)の接続があれば再利用、なければ上限確認して新規作成。実行後に reconcile を呼ぶ。service_role専用。';

-- ── get_google_sync_targets: suspended を除外 ───────────────────────────────────

create or replace function public.get_google_sync_targets(p_user_id uuid default null)
returns table (
  user_id uuid,
  connection_id uuid,
  calendar_id uuid,
  external_calendar_id text,
  calendar_name text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  -- 対象ユーザーの接続を調整(status更新)。
  if p_user_id is null then
    -- 全ユーザー: 各ユーザーの接続を調整。
    perform public.reconcile_google_connections(u.user_id)
      from (select distinct user_id from public.connections where deleted_at is null) u;
  else
    -- 指定ユーザー: その接続を調整。
    perform public.reconcile_google_connections(p_user_id);
  end if;

  return query
    select c.user_id, c.id, cc.calendar_id, cc.external_calendar_id, cal.name
      from public.connections c
      join public.connection_calendars cc on cc.connection_id = c.id
      join public.calendars cal on cal.id = cc.calendar_id
     where c.provider = 'google'
       and c.deleted_at is null
       and c.status = 'active'  -- suspended を除外。
       and cc.selected = true
       and cc.deleted_at is null
       and cal.deleted_at is null
       and (p_user_id is null or c.user_id = p_user_id);
end;
$$;

revoke execute on function public.get_google_sync_targets(uuid) from public, anon, authenticated;
grant execute on function public.get_google_sync_targets(uuid) to service_role;

comment on function public.get_google_sync_targets(uuid) is
  '取り込み対象の接続 × カレンダーを返す。suspended を除外。実行時に対象ユーザーの reconcile を呼ぶ。service_role専用。';

-- ── disconnect_google_connection: 接続ID指定版に置き換え ──────────────────────

-- p_connection_id が null のとき:
--   - 未削除接続がちょうど1件なら それを対象、
--   - 0件なら {deleted:false} 相当、
--   - 2件以上なら connection_ambiguous 例外。
-- p_connection_id が指定されたら、auth.uid() の所有を検証。
-- 削除内容は既存の挙動(calendars / connections / Vault secret の削除、件数返却)を踏襲。
-- 旧の引数なし版は drop して新版に統一。grant は authenticated のまま。

-- 旧の引数なし版が残ると引数なし呼び出しがオーバーロード曖昧になるため先に drop。
drop function if exists public.disconnect_google_connection();

create or replace function public.disconnect_google_connection(p_connection_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn_id uuid;
  v_secret_id uuid;
  v_events int := 0;
  v_cals int := 0;
  v_conn_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_connection_id is null then
    -- 未削除接続数を確認。
    select count(*) into v_conn_count
      from public.connections
     where user_id = v_uid and provider = 'google' and deleted_at is null;

    if v_conn_count = 0 then
      return jsonb_build_object('deleted', false, 'events', 0, 'calendars', 0);
    elsif v_conn_count > 1 then
      raise exception 'connection_ambiguous'
        using errcode = '42610';
    end if;

    -- v_conn_count = 1 のとき、その接続を対象。
    select id, vault_secret_id
      into v_conn_id, v_secret_id
      from public.connections
     where user_id = v_uid and provider = 'google' and deleted_at is null;
  else
    -- p_connection_id が指定されている場合、所有権を検証。
    select id, vault_secret_id
      into v_conn_id, v_secret_id
      from public.connections
     where id = p_connection_id and user_id = v_uid and deleted_at is null;

    if v_conn_id is null then
      raise exception 'connection not found'
        using errcode = '42704';
    end if;
  end if;

  -- 削除対象を見つけた(v_conn_id は null でない)。

  select count(*) into v_events
    from public.events
   where connection_id = v_conn_id and deleted_at is null;
  select count(*) into v_cals
    from public.calendars
   where external_connection_id = v_conn_id and deleted_at is null;

  -- calendars は connections への FK が無いので先に明示削除。
  delete from public.calendars where external_connection_id = v_conn_id;
  -- connections 削除 → connection_calendars / sync_state / events は on delete cascade。
  delete from public.connections where id = v_conn_id;
  -- Vault の refresh_token。
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  return jsonb_build_object('deleted', true, 'events', v_events, 'calendars', v_cals);
end;
$$;

comment on function public.disconnect_google_connection(uuid) is
  'Google接続を解除。p_connection_id が null のとき、未削除接続がちょうど1件ならそれを削除、0件なら何もしない(idempotent)、2件以上なら connection_ambiguous 例外。削除時の calendars / connections / Vault secret はカスケード削除。本人のみ・冪等。';

revoke execute on function public.disconnect_google_connection(uuid) from public, anon;
grant execute on function public.disconnect_google_connection(uuid) to authenticated;
