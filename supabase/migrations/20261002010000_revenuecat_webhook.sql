-- RevenueCat Webhook の受け口(CAP-2)。
--
-- 機能:
--   - entitlements.last_event_ms: 最後に適用した RevenueCat event_timestamp_ms。順序逆転
--     (古いイベントが後から届く)で新しい状態を上書きしないための印。
--   - apply_revenuecat_entitlement: 1 権利の upsert + 接続の再調整。Edge Function(service_role)専用。
--   - apply_revenuecat_transfer: TRANSFER(移転元の権利を移転先へ付け替え)。
--
-- どちらも存在しないユーザーは例外にせず false を返す(無効な user_id で Webhook が
-- 再送され続けないように)。

-- ── last_event_ms ────────────────────────────────────────────────────────────────

alter table public.entitlements
  add column if not exists last_event_ms bigint;

comment on column public.entitlements.last_event_ms is
  '最後に適用した RevenueCat の event_timestamp_ms(ミリ秒)。これより古いイベントでは上書きしない。null は未記録(最初の Webhook で上書き可)。';

-- ── apply_revenuecat_entitlement ────────────────────────────────────────────────

-- 行が無い、または既存の last_event_ms 以降(同時刻は冪等なので再適用可)のときだけ upsert する。
-- 適用したら reconcile_google_connections を呼び、接続の active/suspended を権利に合わせる。
-- 返り値: 適用したら true。ユーザー不在・古いイベントなら false。
create or replace function public.apply_revenuecat_entitlement(
  p_user_id uuid,
  p_entitlement text,
  p_expires_at timestamptz,
  p_product_id text,
  p_store text,
  p_event_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_rows int;
begin
  -- 未知の権利名は check 制約違反で再送地獄にならないよう、何もせず false。
  if p_entitlement not in ('calendar_write', 'multi_account') then
    return false;
  end if;

  -- auth.users に居ないユーザー(削除済み・不正ID)は例外にせず false。
  if not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;

  insert into public.entitlements as e
    (user_id, entitlement, expires_at, product_id, store, last_event_ms, updated_at)
  values
    (p_user_id, p_entitlement, p_expires_at, p_product_id, p_store, p_event_ms, now())
  on conflict (user_id, entitlement) do update
    set expires_at = excluded.expires_at,
        product_id = excluded.product_id,
        store = excluded.store,
        last_event_ms = excluded.last_event_ms,
        updated_at = now()
    where e.last_event_ms is null or e.last_event_ms <= excluded.last_event_ms;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  perform public.reconcile_google_connections(p_user_id);
  return true;
end;
$$;

revoke execute on function public.apply_revenuecat_entitlement(uuid, text, timestamptz, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement(uuid, text, timestamptz, text, text, bigint)
  to service_role;

comment on function public.apply_revenuecat_entitlement(uuid, text, timestamptz, text, text, bigint) is
  'RevenueCat Webhook の権利 1 件を upsert(古いイベントでは上書きしない)し、接続を再調整する。ユーザー不在は false。service_role専用。';

-- ── apply_revenuecat_transfer ───────────────────────────────────────────────────

-- TRANSFER は entitlement_ids も期限も持たないので、移転元の「有効な権利」をそのまま移転先へ
-- コピーし(移転先に既により長い期限があればそれを残す)、移転元は期限を現在時刻にして失効させる。
-- 返り値: 何か変更したら true。いずれかのユーザー不在・変更なしなら false。
create or replace function public.apply_revenuecat_transfer(
  p_from uuid,
  p_to uuid,
  p_event_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_copied int;
  v_revoked int;
begin
  if p_from = p_to then
    return false;
  end if;
  if not exists (select 1 from auth.users where id = p_from)
     or not exists (select 1 from auth.users where id = p_to) then
    return false;
  end if;

  -- 移転先へコピー。既存行は「より長い期限」かつ「古いイベントでない」ときだけ更新。
  insert into public.entitlements as e
    (user_id, entitlement, expires_at, product_id, store, last_event_ms, updated_at)
  select p_to, s.entitlement, s.expires_at, s.product_id, s.store, p_event_ms, now()
    from public.entitlements s
   where s.user_id = p_from
     and (s.expires_at is null or s.expires_at > now())
  on conflict (user_id, entitlement) do update
    set expires_at = excluded.expires_at,
        product_id = excluded.product_id,
        store = excluded.store,
        last_event_ms = excluded.last_event_ms,
        updated_at = now()
    where (e.last_event_ms is null or e.last_event_ms <= excluded.last_event_ms)
      and e.expires_at is not null
      and (excluded.expires_at is null or excluded.expires_at > e.expires_at);
  get diagnostics v_copied = row_count;

  -- 移転元は失効(行は残し、last_event_ms で遅れて届く古いイベントの復活を防ぐ)。
  update public.entitlements
     set expires_at = now(),
         last_event_ms = p_event_ms,
         updated_at = now()
   where user_id = p_from
     and (expires_at is null or expires_at > now())
     and (last_event_ms is null or last_event_ms <= p_event_ms);
  get diagnostics v_revoked = row_count;

  if v_copied = 0 and v_revoked = 0 then
    return false;
  end if;

  perform public.reconcile_google_connections(p_from);
  perform public.reconcile_google_connections(p_to);
  return true;
end;
$$;

revoke execute on function public.apply_revenuecat_transfer(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_transfer(uuid, uuid, bigint)
  to service_role;

comment on function public.apply_revenuecat_transfer(uuid, uuid, bigint) is
  'RevenueCat TRANSFER: 移転元の有効な権利を移転先へコピーし、移転元を失効させ、両者の接続を再調整する。service_role専用。';
