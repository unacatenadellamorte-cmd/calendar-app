-- 引数を持たず、JWTの本人だけを単一トランザクションで削除する。
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_secrets uuid[];
begin
  if v_uid is null or auth.role() <> 'authenticated' then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- FKを持つ同期書込みと競合したら直列化する。削除済みでも再試行は成功する。
  perform 1 from auth.users where id = v_uid for update;
  select array_agg(vault_secret_id) into v_secrets
    from public.connections where user_id = v_uid;

  -- calendars/events/profiles/shift_templates/event_tags/connections/
  -- connection_calendars/sync_state は既存の auth.users FK で連鎖削除される。
  delete from auth.users where id = v_uid;
  delete from vault.secrets where id = any(v_secrets);
end;
$$;

revoke all on function public.delete_my_account() from public, anon, service_role;
grant execute on function public.delete_my_account() to authenticated;
comment on function public.delete_my_account() is
  '認証した本人のアカウント、関連行、連携Vault秘密情報を実削除する。引数なし・冪等。外部カレンダー原本は変更しない。';

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
  -- 削除と連携更新を直列化し、Vaultだけが取り残される競合を防ぐ。
  perform 1 from auth.users where id = p_user_id for key share;
  if not found then
    raise exception 'user does not exist' using errcode = '23503';
  end if;
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
