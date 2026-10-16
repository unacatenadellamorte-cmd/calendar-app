-- GoogleのIDはカレンダー内で一意。端末取り込みの既存キーは変更しない。
alter table public.events add column external_calendar_id text;
update public.events e set external_calendar_id=c.external_calendar_id
  from public.calendars c join public.connections cn on cn.id=c.external_connection_id
  where e.source='google' and e.calendar_id=c.id and e.connection_id=cn.id
    and e.user_id=c.user_id and e.user_id=cn.user_id and cn.provider='google';
do $$ begin
  -- 由来の判らない旧行を別利用者へ付け替えず、適用を止めて調査対象に残す。
  if exists(select 1 from public.events where source='google' and
    (external_calendar_id is null or connection_id is null or external_id is null))
  then raise exception 'Google event references require repair'; end if;
end $$;
alter table public.events add constraint events_external_calendar_shape check (
  (source='google' and external_calendar_id is not null and connection_id is not null and external_id is not null)
  or (source<>'google' and external_calendar_id is null));
drop index public.events_external_uniq;
create unique index events_google_external_uniq on public.events(connection_id,external_calendar_id,external_id)
  where source='google' and connection_id is not null;
create unique index events_external_uniq on public.events(connection_id,external_id)
  where source<>'google' and connection_id is not null;

-- 署名と権限を保ったまま、同期RPCのキーと削除窓を拡張する。
do $$ declare d text; changed text; begin
  d:=pg_get_functiondef('public.apply_calendar_sync(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure);
  changed:=replace(d,'note, source, connection_id, external_id, deleted_at)',
    'note, source, connection_id, external_id, external_calendar_id, deleted_at)');
  changed:=replace(changed,'e.note, ''google'', p_connection_id, e.external_id, null',
    'e.note, ''google'', p_connection_id, e.external_id, p_external_calendar_id, null');
  changed:=replace(changed,'on conflict (connection_id, external_id) where connection_id is not null',
    'on conflict (connection_id, external_calendar_id, external_id) where source=''google'' and connection_id is not null');
  changed:=replace(changed,'and ev.calendar_id = p_calendar_id',
    'and ev.calendar_id = p_calendar_id and ev.user_id = p_user_id and ev.source = ''google'' and ev.external_calendar_id = p_external_calendar_id');
  if changed=d then raise exception 'sync identity function shape changed'; end if;
  execute changed;
end $$;

alter table public.event_google_links add column remove_requested boolean not null default false;
create or replace function public.queue_google_event_trigger() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$ begin
  if tg_op='UPDATE' and new.calendar_id is distinct from old.calendar_id then
    -- 古い送信のleaseは残す。完了後にrevision差で削除を再送し、二重送信を避ける。
    update public.event_google_links l set remove_requested=true,state='pending',revision=revision+1,
      next_attempt_at=now(),failure_count=0,last_error=null
    where l.event_id=new.id and l.user_id=new.user_id and l.state not in ('deleted','orphaned')
      and not exists(select 1 from public.google_push_targets t where t.calendar_id=new.calendar_id
        and t.user_id=new.user_id and t.enabled and t.connection_id=l.connection_id
        and t.google_calendar_id=l.google_calendar_id);
  end if;
  perform public.enqueue_google_event(new.id);
  return new;
end $$;

do $$ declare d text; changed text; begin
  d:=pg_get_functiondef('public.enqueue_google_event(uuid)'::regprocedure);
  changed:=replace(d,'set state=''pending'',revision=revision+1,',
    'set state=''pending'',revision=revision+1,remove_requested=case when l.connection_id=t.connection_id and l.google_calendar_id=t.google_calendar_id then false else l.remove_requested end,');
  if changed=d then raise exception 'enqueue function shape changed'; end if;
  execute changed;
  d:=pg_get_functiondef('public.set_google_push_target(uuid,uuid,uuid,text)'::regprocedure);
  changed:=replace(d,'and not e.is_secret and e.deleted_at is null and l.state',
    'and not l.remove_requested and not e.is_secret and e.deleted_at is null and l.state');
  if changed=d then raise exception 'target function shape changed'; end if;
  execute changed;
end $$;

create or replace function public.claim_google_push(p_user_id uuid default null,p_event_id uuid default null,p_calendar_id uuid default null)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.event_google_links; e public.events; v_lease uuid; v_delete boolean; v_secret boolean;
begin
 for l in select q.* from public.event_google_links q join public.events ev on ev.id=q.event_id and ev.user_id=q.user_id
   join public.connections c on c.id=q.connection_id and c.user_id=q.user_id and c.provider='google'
   where (p_user_id is null or q.user_id=p_user_id) and q.state in ('pending','error')
   and (p_event_id is null or q.event_id=p_event_id) and (p_calendar_id is null or ev.calendar_id=p_calendar_id)
   and q.next_attempt_at<=now() and (q.lease_until is null or q.lease_until<now())
   and c.deleted_at is null and c.write_granted
   and (q.remove_requested or ev.is_secret or ev.deleted_at is not null
     or exists(select 1 from public.calendars cal where cal.id=ev.calendar_id and cal.deleted_at is not null)
     or (c.status='active' and public.can_google_write(q.user_id)))
   and (q.remove_requested or ev.is_secret or ev.deleted_at is not null
     or exists(select 1 from public.calendars cal where cal.id=ev.calendar_id and cal.deleted_at is not null)
     or exists(select 1 from public.google_push_targets t where t.calendar_id=ev.calendar_id
       and t.user_id=q.user_id and t.enabled and t.connection_id=q.connection_id and t.google_calendar_id=q.google_calendar_id))
   order by q.remove_requested desc, ev.is_secret desc, q.next_attempt_at limit 3 for update of q skip locked
 loop
   select * into e from public.events where id=l.event_id;
   v_secret:=e.is_secret;
   v_delete:=l.remove_requested or v_secret or e.deleted_at is not null or exists(select 1 from public.calendars where id=e.calendar_id and deleted_at is not null);
   v_lease:=gen_random_uuid();
   update public.event_google_links set lease_id=v_lease,lease_until=now()+interval '3 minutes' where id=l.id;
   return next to_jsonb(l)||jsonb_build_object('lease_id',v_lease,'event',to_jsonb(e),'remove',v_delete,'secret_cleanup',v_secret);
 end loop;
end $$;

create or replace function public.finish_google_push(p_id uuid,p_lease_id uuid,p_revision bigint,p_state text,p_present boolean,p_error text default null,p_etag text default null)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.event_google_links set state=case when state='paused' then 'paused' when revision=p_revision then p_state else 'pending' end,
 google_event_id=case when p_state='deleted' and revision<>p_revision
   then 'mc'||replace(gen_random_uuid()::text,'-','') else google_event_id end,
 remove_requested=case when p_state='deleted' and revision=p_revision then false else remove_requested end,
 remote_present=p_present,last_error=p_error,etag=p_etag,lease_id=null,lease_until=null,
 failure_count=case when p_state='error' then failure_count+1 else 0 end,
 last_pushed_at=case when p_state in ('synced','deleted') then now() else last_pushed_at end,
 next_attempt_at=case when revision=p_revision and p_state='error' and p_error='invalid-event' then 'infinity'::timestamptz
   else greatest(next_attempt_at,now()+case when p_state='error'
     then interval '2 minutes'*least(30,power(2,least(failure_count,5))) else interval '10 seconds' end) end
 where id=p_id and lease_id=p_lease_id;
$$;
