-- 予定ごとのリマインダー通知(Story 5.4、FR-20)。
--
-- `events` に `reminder_minutes`(何分前に通知するか。null なら未設定)を追加する。
-- 0分〜1週間(10080分)の範囲に制約する(終日予定は対象外だが、それは UI/アプリ側の
-- 責務で、列自体には all_day との相関 CHECK は付けない ── 既存の events_time_shape の
-- ような複合 CHECK を増やすより単純で壊れにくい。spec Design Notes 参照)。
--
-- RLS は既存の `events_update_own`(user_id=auth.uid() のみ、source は問わない)が
-- そのまま使えるため変更しない ── FR-20 の「source を問わず設定可能」という要件は、
-- 元から source 列を条件に含んでいないこのポリシーの範囲内で自然に満たされる。

alter table public.events
  add column reminder_minutes integer;

alter table public.events
  add constraint events_reminder_minutes_check
  check (reminder_minutes is null or (reminder_minutes >= 0 and reminder_minutes <= 10080));
