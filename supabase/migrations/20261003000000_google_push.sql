-- 有料の片方向反映。認証情報・送信状態の変更はサーバー専用。
alter table public.connections add column write_granted boolean not null default false;

create or replace function public.reconcile_google_connections(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  with ranked as (
    select id, row_number() over(order by created_at, id) as position
    from public.connections where user_id=p_user_id and provider='google' and deleted_at is null
  ) update public.connections c set status=case when r.position <= public.get_google_connection_limit(p_user_id)
    then 'active' else 'suspended' end
    from ranked r where c.id=r.id and c.status is distinct from
    case when r.position <= public.get_google_connection_limit(p_user_id) then 'active' else 'suspended' end;
end $$;

-- 旧関数は複数接続なら失敗させる。古いクライアントでも他接続を選ばない。
create or replace function public.get_google_refresh_token(p_user_id uuid)
returns text language plpgsql security definer set search_path = public, vault, pg_temp as $$
begin
  if (select count(*) from public.connections where user_id=p_user_id and provider='google'
    and deleted_at is null and status='active') <> 1 then return null; end if;
  return (select s.decrypted_secret from public.connections c join vault.decrypted_secrets s on s.id=c.vault_secret_id
    where c.user_id=p_user_id and c.provider='google' and c.deleted_at is null and c.status='active');
end $$;

create function public.get_google_connection_token(p_user_id uuid, p_connection_id uuid)
returns text language sql security definer set search_path = public, vault, pg_temp as $$
  select s.decrypted_secret from public.connections c join vault.decrypted_secrets s on s.id=c.vault_secret_id
  where c.id=p_connection_id and c.user_id=p_user_id and c.provider='google' and c.deleted_at is null;
$$;
revoke all on function public.get_google_connection_token(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_google_connection_token(uuid,uuid) to service_role;

create function public.can_google_write(p_user_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp as $$
 select exists(select 1 from public.entitlements where user_id=p_user_id
   and entitlement in ('calendar_write','multi_account') and (expires_at is null or expires_at>now()));
$$;
revoke all on function public.can_google_write(uuid) from public,anon,authenticated;
grant execute on function public.can_google_write(uuid) to service_role;

-- ユーザー行のロックで同時接続追加を直列化。無料の端末接続はGoogle件数に含めない。
drop function public.upsert_google_connection(uuid,text,text);
create function public.upsert_google_connection(p_user_id uuid,p_refresh_token text,p_google_email text,p_write_granted boolean default false)
returns uuid language plpgsql security definer set search_path = public,vault,extensions,pg_temp as $$
declare v_id uuid; v_old uuid; v_new uuid;
begin
 perform 1 from auth.users where id=p_user_id and is_anonymous=false for update;
 if not found then raise exception 'not authenticated'; end if;
 if nullif(trim(p_google_email),'') is null then raise exception 'google identity missing'; end if;
 select id,vault_secret_id into v_id,v_old from public.connections where user_id=p_user_id
   and provider='google' and deleted_at is null and lower(google_email)=lower(p_google_email);
 if v_id is null and (select count(*) from public.connections where user_id=p_user_id
   and provider='google' and deleted_at is null)>=public.get_google_connection_limit(p_user_id)
 then raise exception 'connection_limit_reached'; end if;
 v_new:=vault.create_secret(p_refresh_token,'google_refresh_'||gen_random_uuid()::text,'Google Calendar refresh token');
 if v_id is null then
   insert into public.connections(user_id,provider,google_email,vault_secret_id,write_granted)
   values(p_user_id,'google',p_google_email,v_new,p_write_granted) returning id into v_id;
 else
   update public.connections set vault_secret_id=v_new,google_email=p_google_email,write_granted=p_write_granted where id=v_id;
   delete from vault.secrets where id=v_old;
 end if;
 perform public.reconcile_google_connections(p_user_id);
 return v_id;
end $$;
revoke all on function public.upsert_google_connection(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.upsert_google_connection(uuid,text,text,boolean) to service_role;

create table public.google_push_targets (
 calendar_id uuid primary key references public.calendars(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null references public.connections(id) on delete cascade,
 google_calendar_id text not null,
 enabled boolean not null default true
);
create table public.event_google_links (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 connection_id uuid not null references public.connections(id) on delete cascade,
 google_calendar_id text not null,
 google_event_id text not null default ('mc'||replace(gen_random_uuid()::text,'-','')),
 state text not null default 'pending' check(state in ('pending','synced','error','orphaned','deleted','paused')),
 failure_count integer not null default 0,
 remote_present boolean not null default false,
 revision bigint not null default 1,
 lease_id uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default (now()+interval '10 seconds'),
 last_error text,
 etag text,
 last_pushed_at timestamptz,
 unique(event_id,connection_id,google_calendar_id)
);
create index event_google_links_pending on public.event_google_links(next_attempt_at) where state in ('pending','error');
alter table public.google_push_targets enable row level security;
alter table public.event_google_links enable row level security;
create policy google_push_targets_read on public.google_push_targets for select to authenticated using(user_id=auth.uid());
create policy event_google_links_read on public.event_google_links for select to authenticated using(user_id=auth.uid());
revoke all on public.google_push_targets,public.event_google_links from anon,authenticated;
grant select on public.google_push_targets,public.event_google_links to authenticated;
grant all on public.google_push_targets,public.event_google_links to service_role;

create function public.enqueue_google_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = public,pg_temp as $$
declare e public.events; t public.google_push_targets; v_calendar_deleted boolean;
begin
 select * into e from public.events where id=p_event_id;
 if not found or e.source<>'local' then return; end if;
 select deleted_at is not null into v_calendar_deleted from public.calendars where id=e.calendar_id;
 select * into t from public.google_push_targets where calendar_id=e.calendar_id and user_id=e.user_id and enabled;
 if t.calendar_id is not null and not e.is_secret and e.deleted_at is null then
   insert into public.event_google_links(user_id,event_id,connection_id,google_calendar_id)
   values(e.user_id,e.id,t.connection_id,t.google_calendar_id) on conflict do nothing;
 end if;
 update public.event_google_links l set state='pending',revision=revision+1,
   next_attempt_at=now()+interval '10 seconds',last_error=null,failure_count=0,
   google_event_id=case when l.state='deleted' and not e.is_secret and e.deleted_at is null
     then 'mc'||replace(gen_random_uuid()::text,'-','') else google_event_id end
 where l.event_id=e.id and l.state<>'orphaned'
   and (e.is_secret or e.deleted_at is not null or v_calendar_deleted or
     (l.connection_id=t.connection_id and l.google_calendar_id=t.google_calendar_id));
end $$;
revoke all on function public.enqueue_google_event(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_google_event(uuid) to service_role;
create function public.queue_google_event_trigger() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$ begin perform public.enqueue_google_event(new.id); return new; end $$;
create trigger events_queue_google after insert or update on public.events
 for each row execute function public.queue_google_event_trigger();

-- 設定はEdge Functionが所有権・書き込み可能なGoogleカレンダーを検証してから呼ぶ。
create function public.set_google_push_target(p_user_id uuid,p_calendar_id uuid,p_connection_id uuid,p_google_calendar_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.calendars where id=p_calendar_id and user_id=p_user_id and source='local' and deleted_at is null for update;
 if not found then raise exception 'calendar not found'; end if;
 -- 停止した先の未処理状態を表示し続けない。秘密・削除の後処理は残す。
 update public.event_google_links l set state='paused' from public.events e
   where e.id=l.event_id and e.calendar_id=p_calendar_id and l.user_id=p_user_id
   and not e.is_secret and e.deleted_at is null and l.state in ('pending','error')
   and (p_connection_id is null or l.connection_id<>p_connection_id or l.google_calendar_id<>p_google_calendar_id);
 if p_connection_id is null then
   update public.google_push_targets set enabled=false where calendar_id=p_calendar_id; return;
 end if;
 perform public.reconcile_google_connections(p_user_id);
 if not public.can_google_write(p_user_id) then raise exception 'subscription required'; end if;
 perform 1 from public.connections where id=p_connection_id and user_id=p_user_id and provider='google'
   and status='active' and write_granted and deleted_at is null;
 if not found then raise exception 'write authorization required'; end if;
 insert into public.google_push_targets(calendar_id,user_id,connection_id,google_calendar_id)
 values(p_calendar_id,p_user_id,p_connection_id,p_google_calendar_id)
 on conflict(calendar_id) do update set connection_id=excluded.connection_id,
   google_calendar_id=excluded.google_calendar_id,enabled=true;
 perform public.enqueue_google_event(id) from public.events where calendar_id=p_calendar_id and source='local';
end $$;
revoke all on function public.set_google_push_target(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_google_push_target(uuid,uuid,uuid,text) to service_role;

create function public.claim_google_push(p_user_id uuid default null,p_event_id uuid default null,p_calendar_id uuid default null)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.event_google_links; e public.events; v_lease uuid; v_delete boolean; v_secret boolean;
begin
 for l in select q.* from public.event_google_links q join public.events ev on ev.id=q.event_id
   join public.connections c on c.id=q.connection_id
   where (p_user_id is null or q.user_id=p_user_id) and q.state in ('pending','error')
   and (p_event_id is null or q.event_id=p_event_id) and (p_calendar_id is null or ev.calendar_id=p_calendar_id)
   and q.next_attempt_at<=now() and (q.lease_until is null or q.lease_until<now())
   and c.deleted_at is null and c.write_granted
   and (ev.is_secret or (c.status='active' and public.can_google_write(q.user_id)))
   and (ev.is_secret or ev.deleted_at is not null
     or exists(select 1 from public.calendars cal where cal.id=ev.calendar_id and cal.deleted_at is not null)
     or exists(select 1 from public.google_push_targets t where t.calendar_id=ev.calendar_id
       and t.user_id=q.user_id and t.enabled and t.connection_id=q.connection_id and t.google_calendar_id=q.google_calendar_id))
   order by ev.is_secret desc, q.next_attempt_at limit 3 for update of q skip locked
 loop
   select * into e from public.events where id=l.event_id;
   v_secret:=e.is_secret;
   v_delete:=v_secret or e.deleted_at is not null or exists(select 1 from public.calendars where id=e.calendar_id and deleted_at is not null);
   v_lease:=gen_random_uuid();
   update public.event_google_links set lease_id=v_lease,lease_until=now()+interval '3 minutes' where id=l.id;
   return next to_jsonb(l)||jsonb_build_object('lease_id',v_lease,'event',to_jsonb(e),'remove',v_delete,'secret_cleanup',v_secret);
 end loop;
end $$;
revoke all on function public.claim_google_push(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_google_push(uuid,uuid,uuid) to service_role;

create function public.finish_google_push(p_id uuid,p_lease_id uuid,p_revision bigint,p_state text,p_present boolean,p_error text default null,p_etag text default null)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.event_google_links set state=case when state='paused' then 'paused' when revision=p_revision then p_state else 'pending' end,
 google_event_id=case when p_state='deleted' and revision<>p_revision
   then 'mc'||replace(gen_random_uuid()::text,'-','') else google_event_id end,
 remote_present=p_present,last_error=p_error,etag=p_etag,lease_id=null,lease_until=null,
 failure_count=case when p_state='error' then failure_count+1 else 0 end,
 last_pushed_at=case when p_state in ('synced','deleted') then now() else last_pushed_at end,
 next_attempt_at=greatest(next_attempt_at,now()+case when p_state='error'
   then interval '2 minutes'*least(30,power(2,least(failure_count,5))) else interval '10 seconds' end)
 where id=p_id and lease_id=p_lease_id;
$$;
revoke all on function public.finish_google_push(uuid,uuid,bigint,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_google_push(uuid,uuid,bigint,text,boolean,text,text) to service_role;

create function public.queue_google_calendar_trigger() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$ begin
 if new.deleted_at is distinct from old.deleted_at then
   perform public.enqueue_google_event(id) from public.events where calendar_id=new.id;
 end if;
 return new;
end $$;
create trigger calendars_queue_google after update on public.calendars
 for each row execute function public.queue_google_calendar_trigger();
