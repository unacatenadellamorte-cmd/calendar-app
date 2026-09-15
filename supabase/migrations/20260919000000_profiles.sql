-- プロフィール(表示名・アバター)。auth.users と1:1(ユーザープロフィール登録 + 上部アバター表示)。
-- 真実源は Postgres(ARCHITECTURE-SPINE AD-1)。1ユーザー1行、更新のみ(削除・複数プロフィール切替は作らない)。
-- set_updated_at トリガ関数は 20260907000000_calendars.sql で定義済みのものを再利用する。

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  -- クライアント側は 128x128 / JPEG品質0.85 程度にリサイズしてから保存する想定(Design Notes)。
  -- その想定を大きく超える巨大なテキストが REST 経由で直接投入されるのを防ぐ安全弁。
  avatar_data_url text check (avatar_data_url is null or char_length(avatar_data_url) <= 300000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'ユーザーの表示名・アバター。1ユーザー1行、更新のみ(削除・複数プロフィール切替なし)。';
comment on column public.profiles.avatar_data_url is
  'クライアント側で128x128程度にリサイズ済みの data URI(image/jpeg)。Supabase Storage は使わない。';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
