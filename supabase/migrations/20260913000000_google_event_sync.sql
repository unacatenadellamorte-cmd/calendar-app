-- Google カレンダーの予定取り込み(Story 3.3、ARCHITECTURE-SPINE AD-2 / AD-3 / AD-4 / AD-7)。
--
-- sync-calendars Edge Function が、選択済みの各 Google カレンダーについて
-- refresh_token → access_token → Google Calendar API(events.list、読み取りのみ)で
-- 予定を取得し、安定 ID (connection_id, external_id) で events に upsert する。
-- 時間窓内で Google から消えた予定は論理削除。取り込み単位「接続 × カレンダー」ごとに
-- 最終取り込み時刻・失敗を sync_state に記録。
--
-- events の外部予定行の書き込みはすべて service_role RPC(この関数)経由。
-- クライアントは events を SELECT / ローカル予定の書き込みのみ(既存 RLS のまま)。

-- ── events: 外部予定の識別列 ───────────────────────────────────────────────────

alter table public.events
  add column if not exists connection_id uuid references public.connections (id) on delete cascade,
  add column if not exists external_id text;

comment on column public.events.external_id is
  'Google イベントの安定 ID。(connection_id, external_id) で二重登録を防ぐ。source=local では null。';

-- 同じ Google 予定を二重登録しない。ローカル予定(connection_id is null)は対象外。
create unique index if not exists events_external_uniq
  on public.events (connection_id, external_id)
  where connection_id is not null;

-- 取り込み時の削除差分クエリ(接続 × カレンダー単位で生存行を引く)用。
create index if not exists events_connection_idx
  on public.events (connection_id, calendar_id)
  where deleted_at is null;

-- ── sync_state: 取り込み単位ごとの状態 ───────────────────────────────────────────

create table public.sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  calendar_id uuid references public.calendars (id) on delete cascade,
  external_calendar_id text not null,
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  -- Google 増分同期トークン。v1 は常に null(毎回「時間窓の全件」取得)。
  sync_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sync_state is
  '取り込み単位「接続 × カレンダー」ごとの最終取り込み時刻・失敗。書き込みは service_role RPC のみ。';

create index sync_state_user_idx on public.sync_state (user_id);
create unique index sync_state_uniq
  on public.sync_state (connection_id, external_calendar_id);

create trigger sync_state_set_updated_at
  before update on public.sync_state
  for each row
  execute function public.set_updated_at();

alter table public.sync_state enable row level security;

-- SELECT のみ。書き込みは service_role RPC。
create policy "sync_state_select_own"
  on public.sync_state for select
  using (user_id = (select auth.uid()));

-- ── RPC(すべて service_role 限定・security definer)───────────────────────────

-- 取り込み対象(有効接続 × 選択カレンダー × 生存カレンダー)。
-- p_user_id が null なら全ユーザー(pg_cron の定期経路)、非 null ならそのユーザー。
create or replace function public.get_google_sync_targets(p_user_id uuid default null)
returns table (
  user_id uuid,
  connection_id uuid,
  calendar_id uuid,
  external_calendar_id text,
  calendar_name text
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select c.user_id, c.id, cc.calendar_id, cc.external_calendar_id, cal.name
  from public.connections c
  join public.connection_calendars cc on cc.connection_id = c.id
  join public.calendars cal on cal.id = cc.calendar_id
  where c.provider = 'google'
    and c.deleted_at is null
    and cc.selected = true
    and cc.deleted_at is null
    and cal.deleted_at is null
    and (p_user_id is null or c.user_id = p_user_id);
$$;

revoke execute on function public.get_google_sync_targets(uuid) from public, anon, authenticated;
grant execute on function public.get_google_sync_targets(uuid) to service_role;

-- 1カレンダー分の取り込みを適用する。
-- p_events: [{ external_id text, title text, all_day boolean, starts_at timestamptz,
--             ends_at timestamptz, event_date date, note text }]
-- 冪等 upsert + 時間窓内の削除差分 + sync_state 更新。返り値 { upserted, deleted }。
create or replace function public.apply_calendar_sync(
  p_user_id uuid,
  p_connection_id uuid,
  p_calendar_id uuid,
  p_external_calendar_id text,
  p_events jsonb,
  p_window_min timestamptz,
  p_window_max timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_upserted int := 0;
  v_deleted int := 0;
  v_ids text[];
begin
  select coalesce(array_agg(e.external_id), '{}')
    into v_ids
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
    as e(external_id text);

  -- 冪等 upsert(connection_id + external_id)
  insert into public.events
    (user_id, calendar_id, title, all_day, starts_at, ends_at, event_date,
     note, source, connection_id, external_id, deleted_at)
  select
    p_user_id, p_calendar_id, e.title, e.all_day,
    case when e.all_day then null else e.starts_at end,
    case when e.all_day then null else e.ends_at end,
    case when e.all_day then e.event_date else null end,
    e.note, 'google', p_connection_id, e.external_id, null
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
    as e(external_id text, title text, all_day boolean,
         starts_at timestamptz, ends_at timestamptz, event_date date, note text)
  on conflict (connection_id, external_id) where connection_id is not null do update
    set title = excluded.title,
        all_day = excluded.all_day,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        event_date = excluded.event_date,
        note = excluded.note,
        calendar_id = excluded.calendar_id,
        deleted_at = null,
        updated_at = now();
  get diagnostics v_upserted = row_count;

  -- 時間窓内で今回の応答に無い外部予定は論理削除
  update public.events ev
    set deleted_at = now(), updated_at = now()
  where ev.connection_id = p_connection_id
    and ev.calendar_id = p_calendar_id
    and ev.deleted_at is null
    and ev.external_id is not null
    and not (ev.external_id = any(v_ids))
    and coalesce(ev.starts_at, ev.event_date::timestamptz) between p_window_min and p_window_max;
  get diagnostics v_deleted = row_count;

  insert into public.sync_state
    (user_id, connection_id, calendar_id, external_calendar_id, last_synced_at, last_error, last_error_at)
  values (p_user_id, p_connection_id, p_calendar_id, p_external_calendar_id, now(), null, null)
  on conflict (connection_id, external_calendar_id) do update
    set last_synced_at = now(),
        last_error = null,
        last_error_at = null,
        calendar_id = excluded.calendar_id,
        updated_at = now();

  return jsonb_build_object('upserted', v_upserted, 'deleted', v_deleted);
end;
$$;

revoke execute on function public.apply_calendar_sync(uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_calendar_sync(uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz)
  to service_role;

-- 1カレンダーの取り込み失敗を記録する(他カレンダーの取り込み・表示は止めない)。
create or replace function public.record_calendar_sync_error(
  p_user_id uuid,
  p_connection_id uuid,
  p_calendar_id uuid,
  p_external_calendar_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.sync_state
    (user_id, connection_id, calendar_id, external_calendar_id, last_error, last_error_at)
  values (p_user_id, p_connection_id, p_calendar_id, p_external_calendar_id, left(p_error, 500), now())
  on conflict (connection_id, external_calendar_id) do update
    set last_error = left(excluded.last_error, 500),
        last_error_at = now(),
        calendar_id = excluded.calendar_id,
        updated_at = now();
end;
$$;

revoke execute on function public.record_calendar_sync_error(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_calendar_sync_error(uuid, uuid, uuid, text, text)
  to service_role;
