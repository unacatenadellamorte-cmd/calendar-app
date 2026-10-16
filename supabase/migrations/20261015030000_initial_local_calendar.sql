-- 初回のシフト作成と同じトランザクションで通常カレンダーも用意する。
-- 既存利用者への一括追加や、削除済み通常カレンダーの再作成は行わない。
create function public.create_initial_local_calendar() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
  if new.source='local' and new.is_shift and not exists (
    select 1 from public.calendars where user_id=new.user_id and id<>new.id
  ) then
    insert into public.calendars(user_id,name,color,source,is_shift)
      values(new.user_id,'マイカレンダー','#0072B2','local',false);
  end if;
  return new;
end $$;
create trigger calendars_initial_local after insert on public.calendars
  for each row execute function public.create_initial_local_calendar();
