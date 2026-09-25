-- 専用fixtureだけを使う。全体を一回で実行し、成功時も必ずROLLBACKする。
-- 先に同じトランザクション内で削除マイグレーションを適用してもよい。
begin;
create temporary table deletion_fixture (uid uuid primary key, secret uuid, connection uuid, calendar uuid);
insert into deletion_fixture(uid) values
  ('d3260926-0000-4000-8000-000000000001'),
  ('d3260926-0000-4000-8000-000000000002');
do $$ begin
  if exists(select 1 from auth.users u join deletion_fixture f on f.uid=u.id) then
    raise exception '専用fixture UUIDが既存ユーザーと重なるため中止';
  end if;
  if has_function_privilege('anon','public.delete_my_account()','EXECUTE')
    or not has_function_privilege('authenticated','public.delete_my_account()','EXECUTE')
    or has_function_privilege('service_role','public.delete_my_account()','EXECUTE') then
    raise exception '実行権限が不正';
  end if;
  if (select pronargs from pg_proc where oid='public.delete_my_account()'::regprocedure) <> 0 then
    raise exception '任意ユーザーIDを受け取っている';
  end if;
end $$;
insert into auth.users(id, aud, role, email) select uid,'authenticated','authenticated',uid::text || '@example.invalid' from deletion_fixture;
update deletion_fixture set secret=vault.create_secret('削除検証専用の無効なトークン', 'deletion-test-' || uid::text);
insert into public.connections(user_id,vault_secret_id) select uid,secret from deletion_fixture;
update deletion_fixture f set connection=c.id from public.connections c where c.user_id=f.uid;
insert into public.calendars(user_id,name,color) select uid,'削除検証専用','#123456' from deletion_fixture;
update deletion_fixture f set calendar=c.id from public.calendars c where c.user_id=f.uid;
insert into public.events(user_id,calendar_id,title,all_day,event_date) select uid,calendar,'削除検証専用',true,'2026-09-26' from deletion_fixture;
insert into public.profiles(id,display_name) select uid,'削除検証専用' from deletion_fixture;
insert into public.shift_templates(user_id,name,start_local,end_local,hourly_wage,color) select uid,'削除検証専用','09:00','17:00',1000,'#123456' from deletion_fixture;
insert into public.event_tags(user_id,name,color,start_local,end_local) select uid,'削除検証専用','#123456','09:00','17:00' from deletion_fixture;
insert into public.connection_calendars(user_id,connection_id,external_calendar_id,calendar_id) select uid,connection,'削除検証専用',calendar from deletion_fixture;
insert into public.sync_state(user_id,connection_id,external_calendar_id,calendar_id) select uid,connection,'削除検証専用',calendar from deletion_fixture;

-- JWTなし、anonロールでは拒否される。
set local role anon;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception '未認証の削除が成功した';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception '本人IDなしの削除が成功した';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- auth.usersの削除後に強制失敗したら、アカウントと関連行も戻る。
create function pg_temp.fail_fixture_user_delete() returns trigger language plpgsql as $$
begin
  if old.id = 'd3260926-0000-4000-8000-000000000001'::uuid then
    raise exception 'fixture-user-delete-failure';
  end if;
  return old;
end $$;
create trigger deletion_fixture_failure after delete on auth.users for each row execute function pg_temp.fail_fixture_user_delete();
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d3260926-0000-4000-8000-000000000001"}',true);
set local role authenticated;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception '強制失敗が発生しなかった';
  exception when raise_exception then
    if sqlerrm <> 'fixture-user-delete-failure' then raise; end if;
  end;
end $$;
reset role;
drop trigger deletion_fixture_failure on auth.users;
do $$ begin
  if not exists(select 1 from auth.users where id='d3260926-0000-4000-8000-000000000001')
     or not exists(select 1 from public.events where user_id='d3260926-0000-4000-8000-000000000001') then
    raise exception '失敗時のロールバックが不完全';
  end if;
end $$;

-- 本人だけ削除し、同じJWTでの再試行も成功する。
set local role authenticated;
select public.delete_my_account();
select public.delete_my_account();
reset role;
do $$
declare tab text; own_count int; other_count int;
begin
  if exists(select 1 from auth.users where id='d3260926-0000-4000-8000-000000000001')
    or not exists(select 1 from auth.users where id='d3260926-0000-4000-8000-000000000002') then
    raise exception '本人削除または別ユーザー保護に失敗';
  end if;
  foreach tab in array array['calendars','events','connections','connection_calendars','sync_state','shift_templates','event_tags'] loop
    execute format('select count(*) from public.%I where user_id=$1',tab) into own_count using 'd3260926-0000-4000-8000-000000000001'::uuid;
    execute format('select count(*) from public.%I where user_id=$1',tab) into other_count using 'd3260926-0000-4000-8000-000000000002'::uuid;
    if own_count <> 0 or other_count <> 1 then raise exception '関連行の不整合: %',tab; end if;
  end loop;
  if exists(select 1 from public.profiles where id='d3260926-0000-4000-8000-000000000001')
    or not exists(select 1 from public.profiles where id='d3260926-0000-4000-8000-000000000002') then
    raise exception 'プロフィールの削除・保護に失敗';
  end if;
  if exists(select 1 from vault.secrets where id=(select secret from deletion_fixture where uid='d3260926-0000-4000-8000-000000000001'))
    or not exists(select 1 from vault.secrets where id=(select secret from deletion_fixture where uid='d3260926-0000-4000-8000-000000000002')) then
    raise exception 'Vaultの削除・保護に失敗';
  end if;
end $$;
select 'アカウント削除検証成功。専用fixtureは全てROLLBACKする。' as result;
rollback;
