-- カレンダー(自作 / 将来の外部取り込み)。
-- 真実源は Postgres(ARCHITECTURE-SPINE AD-1)。全行は user_id で分離(RLS)。
-- 優先度(priority)は Story 2.1 で別マイグレーションとして追加する。

-- updated_at を自動更新するトリガ関数(以降のテーブルでも使う)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  source text not null default 'local' check (source in ('local', 'google')),
  is_shift boolean not null default false,
  is_visible boolean not null default true,
  external_connection_id uuid,
  external_calendar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.calendars is '自作カレンダーと外部取り込みカレンダー。source=local が自作。';
comment on column public.calendars.is_shift is 'シフト用カレンダー。ユーザーごとに1つ。削除不可。';

create index calendars_user_id_idx on public.calendars (user_id);
create index calendars_active_idx on public.calendars (user_id) where deleted_at is null;
-- シフト用カレンダーはユーザーごとに最大1つ(同時実行での重複作成を防ぐ)
create unique index calendars_one_shift_per_user
  on public.calendars (user_id)
  where is_shift and deleted_at is null;
-- 外部カレンダーの重複取り込み防止(Epic 3 で使用。local は両カラム null なので影響なし)
create unique index calendars_external_uniq
  on public.calendars (external_connection_id, external_calendar_id)
  where external_connection_id is not null;

create trigger calendars_set_updated_at
  before update on public.calendars
  for each row
  execute function public.set_updated_at();

alter table public.calendars enable row level security;

create policy "calendars_select_own"
  on public.calendars for select
  using (user_id = (select auth.uid()));

create policy "calendars_insert_own"
  on public.calendars for insert
  with check (user_id = (select auth.uid()));

create policy "calendars_update_own"
  on public.calendars for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "calendars_delete_own"
  on public.calendars for delete
  using (user_id = (select auth.uid()));
