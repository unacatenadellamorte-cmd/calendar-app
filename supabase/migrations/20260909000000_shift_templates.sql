-- お気に入りシフトのテンプレ(Epic 4 / FR-11)。
-- シフト「実体」は events のサブタイプ(AD-8)。ここはあくまでテンプレ表。
-- テンプレは日付を持たない壁時計の時間帯(HH:MM の text)。適用時に対象日 + TZ で
-- timestamptz を組み立てる(Story 4.2)。全行 user_id で分離(RLS)。

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  start_local text not null check (start_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_local text not null check (end_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  break_minutes integer not null default 0 check (break_minutes >= 0),
  hourly_wage integer not null check (hourly_wage >= 0),
  workplace_label text check (workplace_label is null or char_length(workplace_label) <= 100),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.shift_templates is 'お気に入りシフトのテンプレ。start/end は HH:MM の壁時計。';

create index shift_templates_user_id_idx on public.shift_templates (user_id);
create index shift_templates_active_idx
  on public.shift_templates (user_id)
  where deleted_at is null;

create trigger shift_templates_set_updated_at
  before update on public.shift_templates
  for each row
  execute function public.set_updated_at();

alter table public.shift_templates enable row level security;

create policy "shift_templates_select_own"
  on public.shift_templates for select
  using (user_id = (select auth.uid()));

create policy "shift_templates_insert_own"
  on public.shift_templates for insert
  with check (user_id = (select auth.uid()));

create policy "shift_templates_update_own"
  on public.shift_templates for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "shift_templates_delete_own"
  on public.shift_templates for delete
  using (user_id = (select auth.uid()));
