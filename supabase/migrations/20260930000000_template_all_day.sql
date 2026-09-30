-- 既存テンプレートは時刻付きのまま維持する。
alter table public.shift_templates add column all_day boolean not null default false;
alter table public.event_tags add column all_day boolean not null default false;
