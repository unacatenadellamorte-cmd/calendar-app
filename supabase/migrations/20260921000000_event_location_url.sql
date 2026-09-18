-- 予定の場所と外部リンク。既存予定は NULL のまま保つ。
alter table public.events
  add column if not exists location text,
  add column if not exists event_url text;

alter table public.events
  add constraint events_location_length check (location is null or char_length(location) <= 1000),
  add constraint events_event_url_length check (event_url is null or char_length(event_url) <= 2048);
