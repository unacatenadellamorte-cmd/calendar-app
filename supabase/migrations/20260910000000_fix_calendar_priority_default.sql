-- 修正(Story 2.1 のバグ): calendars.priority の `default 0` が、
-- before-insert トリガ calendars_set_priority() の `if new.priority is null` を
-- 無効化していた。列 default はトリガより先に評価されるため、priority を指定しない
-- insert では new.priority が 0(null でない)になり、トリガが採番しない。
-- その結果、2件目以降のカレンダーが priority=0 のまま入り、
-- 部分ユニーク索引 calendars_priority_uniq (user_id, priority) where deleted_at is null
-- に衝突して作成に失敗していた(SQLSTATE 23505)。
--
-- 対処: default を外し、新規行の採番をトリガに一本化する。
-- NOT NULL は維持する。NOT NULL 検査は before-insert 行トリガの「後」に走るので、
-- トリガが値を入れれば通る。明示的に priority を渡す経路(取り込み Edge Function 等)は
-- 従来どおりトリガの `if new.priority is null` で素通りし、指定値がそのまま入る。

alter table public.calendars alter column priority drop default;
