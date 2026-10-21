-- 終日予定の排他的終了日。旧行(NULL)は読み出し側で翌日として互換維持する。
alter table public.events add column if not exists event_end_date date;

alter table public.events drop constraint if exists events_time_shape;
alter table public.events add constraint events_time_shape check (
  (all_day = false and starts_at is not null and ends_at is not null and starts_at <= ends_at and event_date is null and event_end_date is null)
  or
  (all_day = true and starts_at is null and ends_at is null and event_date is not null and (event_end_date is null or event_end_date > event_date))
);

-- 適用済みの所有者ガード・Google複合ID・権限を保持し、RPC定義を上書きせず列だけ拡張する。
do $$
declare d text; changed text;
begin
  d := pg_get_functiondef('public.apply_calendar_sync(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz)'::regprocedure);
  changed := replace(d, 'event_date,' || chr(10) || '     note, source, connection_id, external_id, external_calendar_id, deleted_at)',
    'event_date, event_end_date,' || chr(10) || '     note, source, connection_id, external_id, external_calendar_id, deleted_at)');
  if changed = d then raise exception 'event_end_date insert column shape changed'; end if;
  d := changed;
  changed := replace(d, 'case when e.all_day then e.event_date else null end,',
    'case when e.all_day then e.event_date else null end, case when e.all_day then e.event_end_date else null end,');
  if changed = d then raise exception 'event_end_date insert value shape changed'; end if;
  d := changed;
  changed := replace(d, 'event_date date, note text)', 'event_date date, event_end_date date, note text)');
  if changed = d then raise exception 'event_end_date json shape changed'; end if;
  d := changed;
  changed := replace(d, 'event_date = excluded.event_date,', 'event_date = excluded.event_date, event_end_date = excluded.event_end_date,');
  if changed = d then raise exception 'event_end_date update shape changed'; end if;
  if position('external_calendar_id, external_id' in changed) = 0
     or position('where events.user_id = excluded.user_id' in changed) = 0
     or position('invalid sync owner' in changed) = 0 then
    raise exception 'apply_calendar_sync protections missing';
  end if;
  execute changed;
end $$;

revoke execute on function public.apply_calendar_sync(uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_calendar_sync(uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz)
  to service_role;
