-- 取り込むカレンダーの選択(Story 3.2、ARCHITECTURE-SPINE AD-2 / AD-3)。
-- connection_calendars = Google アカウント内のカレンダー候補カタログ。
-- selected=true にすると public.calendars(source='google')行が作られ、Epic 2 の
-- 優先度・並べ替えにそのまま乗る。予定の同期は Story 3.3。
--
-- 書き込みはすべて service_role RPC(google-calendars Edge Function)経由。
-- クライアントは SELECT のみ。Google API 呼び出し・refresh_token 復号は関数だけ。

create table public.connection_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  external_calendar_id text not null,
  summary text not null default '',
  background_color text,
  selected boolean not null default false,
  -- selected 時に対応する public.calendars 行。deselect で null に戻す。
  calendar_id uuid references public.calendars (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Google 側からカレンダーが消えたら deleted_at をセット(カタログから除外)。
  deleted_at timestamptz
);

comment on table public.connection_calendars is
  'Google アカウント内のカレンダー候補。selected=true で public.calendars(source=google)を生成。';

create index connection_calendars_user_idx on public.connection_calendars (user_id);
create unique index connection_calendars_uniq
  on public.connection_calendars (connection_id, external_calendar_id);

create trigger connection_calendars_set_updated_at
  before update on public.connection_calendars
  for each row
  execute function public.set_updated_at();

alter table public.connection_calendars enable row level security;

-- SELECT のみ。書き込みは service_role RPC。
create policy "connection_calendars_select_own"
  on public.connection_calendars for select
  using (user_id = (select auth.uid()));

-- ── RPC(すべて service_role 限定・security definer)───────────────────────────

-- 復号済み refresh_token を返す。google-calendars / sync-calendars 関数が使う。
create or replace function public.get_google_refresh_token(p_user_id uuid)
returns text
language sql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
  select s.decrypted_secret
  from public.connections c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.user_id = p_user_id
    and c.provider = 'google'
    and c.deleted_at is null
  limit 1;
$$;

revoke execute on function public.get_google_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.get_google_refresh_token(uuid) to service_role;

-- Google calendarList の結果でカタログを更新する。
-- p_items: [{ externalCalendarId text, summary text, backgroundColor text }]
-- 応答に無い既存行は deleted_at をセットし、selected なら対応 calendars 行も論理削除。
create or replace function public.upsert_connection_calendars(
  p_user_id uuid,
  p_connection_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ids text[];
begin
  select coalesce(array_agg(x.external_calendar_id), '{}')
    into v_ids
  from jsonb_to_recordset(p_items)
    as x(external_calendar_id text, summary text, background_color text);

  -- upsert(selected / calendar_id は触らない)
  insert into public.connection_calendars
    (user_id, connection_id, external_calendar_id, summary, background_color, deleted_at)
  select p_user_id, p_connection_id, x.external_calendar_id,
         coalesce(x.summary, ''), x.background_color, null
  from jsonb_to_recordset(p_items)
    as x(external_calendar_id text, summary text, background_color text)
  on conflict (connection_id, external_calendar_id) do update
    set summary = excluded.summary,
        background_color = excluded.background_color,
        deleted_at = null,
        updated_at = now();

  -- 応答に無くなったカレンダーはカタログから外す
  update public.connection_calendars cc
    set deleted_at = now(), selected = false, updated_at = now()
  where cc.connection_id = p_connection_id
    and cc.deleted_at is null
    and not (cc.external_calendar_id = any(v_ids));

  -- 外れたカレンダーの calendars 行も論理削除
  update public.calendars c
    set deleted_at = now()
  from public.connection_calendars cc
  where cc.connection_id = p_connection_id
    and cc.deleted_at is not null
    and cc.calendar_id = c.id
    and c.deleted_at is null;
end;
$$;

revoke execute on function public.upsert_connection_calendars(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_connection_calendars(uuid, uuid, jsonb) to service_role;

-- 候補のオン/オフ。select 時は calendars 行を作る/復活、deselect 時は論理削除。
-- summary / color はカタログ行(connection_calendars)から読む(Edge Function で
-- 正規化済み #RRGGBB を格納しておく)。
create or replace function public.set_google_calendar_selection(
  p_user_id uuid,
  p_connection_id uuid,
  p_external_calendar_id text,
  p_selected boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cc public.connection_calendars;
  v_calendar_id uuid;
  v_name text;
  v_color text;
begin
  select * into v_cc
  from public.connection_calendars
  where connection_id = p_connection_id
    and external_calendar_id = p_external_calendar_id;

  if not found then
    raise exception 'connection_calendar not found';
  end if;

  v_name := coalesce(nullif(v_cc.summary, ''), 'Google カレンダー');
  v_color := coalesce(v_cc.background_color, '#7A7A7A');

  if p_selected then
    -- 既存の(論理削除含む)外部カレンダー行を探す
    select id into v_calendar_id
    from public.calendars
    where external_connection_id = p_connection_id
      and external_calendar_id = p_external_calendar_id;

    if v_calendar_id is null then
      insert into public.calendars
        (user_id, name, color, source, external_connection_id, external_calendar_id)
      values
        (p_user_id, v_name, v_color, 'google', p_connection_id, p_external_calendar_id)
      returning id into v_calendar_id;
    else
      -- 論理削除されていた行を復活させる。元の priority スロットは他カレンダーの
      -- 並べ替えで奪われている可能性があるため、最下位に採番し直す
      -- (calendars_priority_uniq 衝突を避ける。BEFORE INSERT トリガは UPDATE では効かない)。
      update public.calendars
        set deleted_at = null,
            name = v_name,
            color = v_color,
            priority = (
              select coalesce(max(priority), -1) + 1
              from public.calendars
              where user_id = p_user_id and deleted_at is null
            )
        where id = v_calendar_id;
    end if;

    update public.connection_calendars
      set selected = true, calendar_id = v_calendar_id, deleted_at = null, updated_at = now()
      where id = v_cc.id;
    return v_calendar_id;
  else
    if v_cc.calendar_id is not null then
      update public.calendars set deleted_at = now() where id = v_cc.calendar_id;
    end if;
    update public.connection_calendars
      set selected = false, updated_at = now()
      where id = v_cc.id;
    return v_cc.calendar_id;
  end if;
end;
$$;

revoke execute on function public.set_google_calendar_selection(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_google_calendar_selection(uuid, uuid, text, boolean) to service_role;
