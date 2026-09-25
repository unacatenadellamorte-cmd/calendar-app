-- タグは入力用のひな形。予定へ値を複写するため、予定との参照関係は持たない。
begin;
alter table public.events add column label_color text
  check (label_color is null or label_color ~ '^#[0-9A-Fa-f]{6}$');

create table public.event_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  start_local text not null check (start_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_local text not null check (end_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (start_local <> end_local)
);
create index event_tags_active_idx on public.event_tags(user_id) where deleted_at is null;
create trigger event_tags_set_updated_at before update on public.event_tags
  for each row execute function public.set_updated_at();
alter table public.event_tags enable row level security;
create policy event_tags_select_own on public.event_tags for select using (user_id = (select auth.uid()));
create policy event_tags_insert_own on public.event_tags for insert with check (user_id = (select auth.uid()));
create policy event_tags_update_own on public.event_tags for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy event_tags_delete_own on public.event_tags for delete using (user_id = (select auth.uid()));
commit;
