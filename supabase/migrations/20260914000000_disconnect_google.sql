-- Google 接続の解除(Story 3.4、ARCHITECTURE-SPINE AD-3 / §8.3 / NFR3)。
--
-- 解除するとそのアカウント由来の痕跡を残さない:
--   calendars(source='google')  ── FK cascade が無いので明示削除
--   connections 行               ── 削除で connection_calendars / sync_state / events が
--                                   on delete cascade で消える
--   vault.secrets(refresh_token) ── 明示削除
--
-- この RPC だけはユーザー本人が直接呼ぶ(他の connections 系 RPC は service_role 専用)。
-- security definer で auth.uid() を検証し、authenticated にのみ実行を許可する。
-- 冪等: 有効な接続が無ければ何もせず {deleted:false} を返す。

create or replace function public.disconnect_google_connection()
returns jsonb
language plpgsql
security definer
-- security definer は Supabase 既定の search_path を失うため明示する。
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn_id uuid;
  v_secret_id uuid;
  v_events int := 0;
  v_cals int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select id, vault_secret_id
    into v_conn_id, v_secret_id
    from public.connections
    where user_id = v_uid and provider = 'google' and deleted_at is null;

  if v_conn_id is null then
    return jsonb_build_object('deleted', false, 'events', 0, 'calendars', 0);
  end if;

  select count(*) into v_events
    from public.events
    where connection_id = v_conn_id and deleted_at is null;
  select count(*) into v_cals
    from public.calendars
    where external_connection_id = v_conn_id and deleted_at is null;

  -- calendars は connections への FK が無いので先に明示削除する。
  delete from public.calendars where external_connection_id = v_conn_id;
  -- connections 削除 → connection_calendars / sync_state / events は on delete cascade。
  delete from public.connections where id = v_conn_id;
  -- Vault の refresh_token。
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  return jsonb_build_object('deleted', true, 'events', v_events, 'calendars', v_cals);
end;
$$;

comment on function public.disconnect_google_connection() is
  'Google 接続を解除し、そのアカウント由来の calendars / events / connection_calendars / sync_state / connections 行と Vault secret を実削除する。本人のみ・冪等。';

revoke execute on function public.disconnect_google_connection() from public, anon;
grant execute on function public.disconnect_google_connection() to authenticated;
