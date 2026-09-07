-- カレンダーの表示優先度(Story 2.1、ARCHITECTURE-SPINE AD-5)。
-- 整数順序値。小さいほど上位。user_id 内で一意(部分ユニーク索引)。
-- 採番・並べ替えは reorder_calendars RPC と calendars_set_priority トリガ経由のみ。
-- UI・Edge Function は priority を直接計算しない。

-- 1) 列を追加(まず nullable で入れて backfill する)
alter table public.calendars add column priority integer;

-- 2) 既存のアクティブ行を backfill: ユーザーごとに is_shift, created_at 順で 0 起点
update public.calendars c
set priority = sub.rn - 1
from (
  select
    id,
    row_number() over (
      partition by user_id
      order by is_shift, created_at, id
    ) as rn
  from public.calendars
  where deleted_at is null
) sub
where c.id = sub.id and c.deleted_at is null;

-- 3) 削除済み行にも値を入れる(NOT NULL のため。部分ユニーク索引が除外する)
update public.calendars set priority = 0 where priority is null;

-- 4) NOT NULL + default
alter table public.calendars alter column priority set not null;
alter table public.calendars alter column priority set default 0;

comment on column public.calendars.priority is
  '表示優先度。小さいほど上位。user_id 内で一意(部分ユニーク索引)。採番/並べ替えは reorder_calendars / calendars_set_priority のみ。';

-- 5) 部分ユニーク索引(アクティブ行のみ)
create unique index calendars_priority_uniq
  on public.calendars (user_id, priority)
  where deleted_at is null;

-- 6) 新規行の最下位採番トリガ(フロントの insert も Edge Function の insert もカバー)
create or replace function public.calendars_set_priority()
returns trigger
language plpgsql
as $$
begin
  if new.priority is null then
    select coalesce(max(priority), -1) + 1
      into new.priority
      from public.calendars
      where user_id = new.user_id and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger calendars_set_priority_trg
  before insert on public.calendars
  for each row
  execute function public.calendars_set_priority();

-- 7) 並べ替え RPC。
--    一意制約(immediate な部分ユニーク索引)を保つため、単発の相互 UPDATE はせず、
--    「全対象を退避オフセットへ一括 → 指定順で 0..n-1 を再採番 → 余りを連番の続きへ」の三段。
--    どの単一 UPDATE 文の中でも 2 行が同じ priority を持たない。
create or replace function public.reorder_calendars(ordered_ids uuid[])
returns void
language plpgsql
security invoker
as $$
declare
  uid uuid := (select auth.uid());
  offset_base constant integer := 1000000;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- 退避(全体を同じだけずらすので互いに衝突しない)
  update public.calendars
  set priority = priority + offset_base
  where user_id = uid and deleted_at is null;

  -- 指定順に 0..n-1 を採番
  update public.calendars c
  set priority = v.pos - 1
  from unnest(ordered_ids) with ordinality as v(id, pos)
  where c.id = v.id and c.user_id = uid and c.deleted_at is null;

  -- ordered_ids に含まれなかった行は連番の続きへ(防御的。通常は 0 件)
  update public.calendars c
  set priority = coalesce(array_length(ordered_ids, 1), 0) + sub.rn - 1
  from (
    select id, row_number() over (order by priority, id) as rn
    from public.calendars
    where user_id = uid and deleted_at is null and priority >= offset_base
  ) sub
  where c.id = sub.id;
end;
$$;

comment on function public.reorder_calendars(uuid[]) is
  'ordered_ids の順に calendars.priority を 0..n-1 で採番し直す。RLS 準拠、本人の行のみ。';
