-- Google 接続(Story 3.1、ARCHITECTURE-SPINE AD-3)。
-- OAuth の refresh_token は Supabase Vault に置き、この表は「どの Vault secret か」への
-- 参照(vault_secret_id)だけを持つ。トークン本体はクライアントに一切返さない。
--
-- 書き込み(INSERT / UPDATE)はクライアントからはできない ── RLS を有効にしつつ
-- INSERT / UPDATE ポリシーを作らない。oauth-exchange Edge Function が service_role で行う。
-- クライアントは自分の接続を「見る」だけ(SELECT)。接続解除(DELETE)は Story 3.4。

-- Vault(vault スキーマ / vault.secrets / vault.decrypted_secrets)。
-- Supabase ホスト環境では既定で有効。念のため冪等に。
create extension if not exists supabase_vault;

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  -- 表示用。primary カレンダーの id(= Google アカウントのメール)。取得失敗時は null。
  google_email text,
  -- vault.secrets.id。refresh_token 本体は Vault。この表には持たない。
  vault_secret_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.connections is
  'Google OAuth 接続。refresh_token は Vault(vault_secret_id 参照)。書き込みは Edge Function のみ。';
comment on column public.connections.vault_secret_id is
  'vault.secrets.id。復号は service_role(Edge Function)のみ。';

create index connections_user_id_idx on public.connections (user_id);
-- 有効な Google 接続はユーザーごとに最大1つ(v1。複数アカウントは v2)。
create unique index connections_one_active_per_user
  on public.connections (user_id, provider)
  where deleted_at is null;

create trigger connections_set_updated_at
  before update on public.connections
  for each row
  execute function public.set_updated_at();

alter table public.connections enable row level security;

-- SELECT のみ。INSERT / UPDATE ポリシーは意図的に作らない(service_role が担う)。
create policy "connections_select_own"
  on public.connections for select
  using (user_id = (select auth.uid()));

-- oauth-exchange Edge Function から呼ぶ。refresh_token を Vault に入れ、
-- connections 行を作る/貼り替える。トークンは Vault の外に出ない。
-- service_role のみ実行可(クライアントからは呼べない)。
create or replace function public.upsert_google_connection(
  p_user_id uuid,
  p_refresh_token text,
  p_google_email text
)
returns uuid
language plpgsql
security definer
-- security definer は Supabase 既定の search_path(extensions を含む)を失うため明示する。
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_conn_id uuid;
  v_old_secret_id uuid;
  v_new_secret_id uuid;
begin
  select id, vault_secret_id into v_conn_id, v_old_secret_id
    from public.connections
    where user_id = p_user_id and provider = 'google' and deleted_at is null;

  v_new_secret_id := vault.create_secret(
    p_refresh_token,
    'google_refresh_' || gen_random_uuid()::text,
    'Google Calendar refresh token'
  );

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
    insert into public.connections (user_id, provider, google_email, vault_secret_id)
      values (p_user_id, 'google', p_google_email, v_new_secret_id)
      returning id into v_conn_id;
  end if;

  return v_conn_id;
end;
$$;

revoke execute on function public.upsert_google_connection(uuid, text, text) from public, anon, authenticated;
grant execute on function public.upsert_google_connection(uuid, text, text) to service_role;

comment on function public.upsert_google_connection(uuid, text, text) is
  'oauth-exchange 専用。refresh_token を Vault へ、connections を upsert。service_role のみ。';
