-- 端末カレンダー接続の解除(Story 5.3、ARCHITECTURE-SPINE Epic5 AD-14 / AD-17)。
--
-- Google(Story 3.4)と違い、端末カレンダー接続には保護すべき秘密(refresh_token)が
-- 無いため、専用の security definer RPC は作らない。認証済みクライアントが
-- 2手のクライアント直接操作で解除する:
--   (1) calendars を external_connection_id で明示削除(calendars→connections に
--       FK が無いため。既存の calendars_delete_own ポリシーで足りる)
--   (2) connections を id で削除 ── ここで追加する DELETE ポリシーが必要
--       (connection_calendars / events / sync_state は on delete cascade で連鎖削除される)
--
-- Google 行(provider='google')は引き続き DELETE 不可(disconnect_google_connection
-- RPC 経由のみ)。このポリシーは provider='device' の行にしか一致しない。

create policy "connections_delete_device"
  on public.connections for delete
  using (user_id = (select auth.uid()) and provider = 'device');
