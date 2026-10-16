-- 本人のカレンダーでも、外部取り込み先へlocal予定を作れないようにする。
do $$
declare original text; corrected text;
begin
  original := pg_get_functiondef('public.guard_event_references()'::regprocedure);
  corrected := replace(original,
    'if new.connection_id is not null or new.external_id is not null then',
    'if not exists (select 1 from public.calendars c where c.id=new.calendar_id and c.user_id=new.user_id and c.source=''local'') or new.connection_id is not null or new.external_id is not null then');
  if corrected=original then raise exception 'event guard function shape changed'; end if;
  execute corrected;
end $$;
