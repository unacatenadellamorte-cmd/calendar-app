begin;
alter table public.event_tags add column stamp_id text;
alter table public.event_tags add constraint event_tags_stamp_id_check check (
  stamp_id is null or stamp_id in (
    'work','meeting','school','study','morning','late','night','overtime','holiday','home','chores','trash','shopping','payment','meal','cafe',
    'drinks','travel','car','train','hospital','dentist','medicine','salon','exercise','walk','pickup','pet','birthday','date','music','movie'
  )
);
alter table public.event_tags drop constraint event_tags_name_check;
alter table public.event_tags add constraint event_tags_name_check check (
  (char_length(trim(name)) between 1 and 200) or (char_length(trim(name)) = 0 and stamp_id is not null)
);
alter table public.events add column stamp_id text;
alter table public.events add column stamp_only boolean not null default false;
alter table public.events add constraint events_stamp_id_check check (
  stamp_id is null or stamp_id in (
    'work','meeting','school','study','morning','late','night','overtime','holiday','home','chores','trash','shopping','payment','meal','cafe',
    'drinks','travel','car','train','hospital','dentist','medicine','salon','exercise','walk','pickup','pet','birthday','date','music','movie'
  )
);
commit;
