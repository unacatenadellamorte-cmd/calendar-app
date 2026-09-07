-- 予定。1つのカレンダーに属す(ARCHITECTURE-SPINE)。
-- シフトは events のサブタイプ(AD-8): break_minutes / hourly_wage / workplace_label /
-- shift_template_id は Epic 4 で使う。ここでは常に null。
-- 時刻は timestamptz(UTC)で保存し、表示・入力時に TZ 変換する(AD-7)。

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  all_day boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  event_date date,
  note text check (note is null or char_length(note) <= 2000),
  source text not null default 'local' check (source in ('local', 'google')),
  -- シフト属性(Epic 4)。今は常に null。
  break_minutes integer check (break_minutes is null or break_minutes >= 0),
  hourly_wage integer check (hourly_wage is null or hourly_wage >= 0),
  workplace_label text,
  shift_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 時刻付き: starts/ends 必須・順序・event_date は null
  -- 終日:     event_date 必須・時刻は null
  constraint events_time_shape check (
    (
      all_day = false
      and starts_at is not null
      and ends_at is not null
      and starts_at <= ends_at
      and event_date is null
    )
    or (
      all_day = true
      and event_date is not null
      and starts_at is null
      and ends_at is null
    )
  )
);

comment on table public.events is '予定。シフトは source=local + シフト属性つきのサブタイプ(AD-8)。';

create index events_user_id_idx on public.events (user_id);
create index events_calendar_id_idx on public.events (calendar_id);
create index events_active_starts_idx
  on public.events (user_id, starts_at)
  where deleted_at is null;
create index events_active_date_idx
  on public.events (user_id, event_date)
  where deleted_at is null;

create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

alter table public.events enable row level security;

create policy "events_select_own"
  on public.events for select
  using (user_id = (select auth.uid()));

create policy "events_insert_own"
  on public.events for insert
  with check (user_id = (select auth.uid()));

create policy "events_update_own"
  on public.events for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "events_delete_own"
  on public.events for delete
  using (user_id = (select auth.uid()));
