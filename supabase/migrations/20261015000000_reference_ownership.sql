-- 認証済みクライアントの参照偽装を拒否し、本人device同期は維持する。
update public.connections set vault_secret_id=null where provider='device' and vault_secret_id is not null;
alter table public.connections add constraint device_connection_no_vault
  check (provider <> 'device' or vault_secret_id is null);

create or replace function public.guard_event_references()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  -- 同期RPCの実行者とサービスだけがGoogleの保護列を書ける。
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if new.user_id is distinct from auth.uid() or not exists (
    select 1 from public.calendars c where c.id=new.calendar_id and c.user_id=new.user_id
  ) then raise exception 'invalid event owner' using errcode='42501'; end if;
  if tg_op='UPDATE' and old.source='google' then
    if to_jsonb(new)->'external_calendar_id' is distinct from to_jsonb(old)->'external_calendar_id'
       or (new.user_id,new.calendar_id,new.source,new.connection_id,new.external_id)
       is distinct from (old.user_id,old.calendar_id,old.source,old.connection_id,old.external_id)
    then raise exception 'protected Google references' using errcode='42501'; end if;
    return new;
  end if;
  if new.source='google' then raise exception 'Google import requires service' using errcode='42501'; end if;
  if tg_op='UPDATE' and new.source is distinct from old.source then
    raise exception 'protected event source' using errcode='42501';
  end if;
  if new.source='local' then
    if new.connection_id is not null or new.external_id is not null then
      raise exception 'local event has external references' using errcode='42501';
    end if;
  elsif new.source='device' then
    if new.external_id is null or not exists (
      select 1 from public.connections cn join public.calendars c
        on c.id=new.calendar_id and c.external_connection_id=cn.id
      where cn.id=new.connection_id and cn.user_id=new.user_id and cn.provider='device'
        and c.user_id=new.user_id and c.source='device' and cn.deleted_at is null
    ) then raise exception 'invalid device references' using errcode='42501'; end if;
  end if;
  return new;
end $$;
create trigger guard_event_references before insert or update on public.events
  for each row execute function public.guard_event_references();

-- 適用済みの関数の署名・権限を保ち、限定した防御を追加する。
do $$
declare d text; changed text;
begin
  d:=pg_get_functiondef('public.disconnect_google_connection(uuid)'::regprocedure);
  changed:=replace(d,'where id = p_connection_id and user_id = v_uid and deleted_at is null',
    'where id = p_connection_id and user_id = v_uid and provider = ''google'' and deleted_at is null');
  if changed=d then raise exception 'disconnect function shape changed'; end if;
  execute changed;
  d:=pg_get_functiondef('public.delete_my_account()'::regprocedure);
  changed:=replace(d,'from public.connections where user_id = v_uid;',
    'from public.connections where user_id = v_uid and provider = ''google'';');
  if changed=d then raise exception 'delete function shape changed'; end if;
  execute changed;
  d:=pg_get_functiondef('public.apply_calendar_sync(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure);
  changed:=replace(d,'updated_at = now();','updated_at = now() where events.user_id = excluded.user_id;');
  -- sync_state側のUPDATEにはevents参照を入れない。
  changed:=replace(changed,'calendar_id = excluded.calendar_id,'||chr(10)||'        updated_at = now() where events.user_id = excluded.user_id;',
    'calendar_id = excluded.calendar_id,'||chr(10)||'        updated_at = now();');
  if changed=d then raise exception 'sync function shape changed'; end if;
  changed:=replace(changed,'begin'||chr(10),'begin'||chr(10)||
    '  if not exists (select 1 from public.connections cn join public.calendars c on c.external_connection_id=cn.id where cn.id=p_connection_id and cn.user_id=p_user_id and cn.provider=''google'' and c.id=p_calendar_id and c.user_id=p_user_id and c.external_calendar_id=p_external_calendar_id) then raise exception ''invalid sync owner'' using errcode=''42501''; end if;'||chr(10));
  execute changed;
end $$;
