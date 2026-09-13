-- 端末カレンダー接続の土台(Story 5.2、ARCHITECTURE-SPINE Epic5 AD-13 / AD-17)。
--
-- (1) provider='device' / source='device' を connections / calendars / events の
--     CHECK 制約に追加する。events は Story 5.3(端末カレンダーの予定取り込み)で
--     使うが、3箇所まとめて1本のマイグレーションで揃える(AD-17)。
-- (2) connections に「本人・provider='device' の行だけ INSERT できる」ポリシーを
--     追加する(Google 行は従来どおり INSERT ポリシー無し = service_role 専用のまま)。
-- (3) connection_calendars に「connection_id が指す connections 行が
--     provider='device' かつ本人所有のときだけ」INSERT/UPDATE を許すポリシーを
--     追加する。calendars テーブルは既存の calendars_insert_own/update_own
--     (user_id=auth.uid() のみ、source 無関係)がそのまま使えるため変更不要。
--
-- 端末カレンダーの書き込みは Edge Function/service_role を経由しない
-- (AD-17: 端末側には Google の refresh_token のような保護すべき秘密が無いため)。
-- 認証済みクライアントが supabase-js を直接呼び、ここで追加する RLS の範囲内で書く。

-- ── CHECK 制約の拡張(列定義に紐づく無名 CHECK は `<table>_<column>_check` という
--    既定名を持つ) ─────────────────────────────────────────────────────────────

alter table public.connections
  drop constraint connections_provider_check,
  add constraint connections_provider_check check (provider in ('google', 'device'));

alter table public.calendars
  drop constraint calendars_source_check,
  add constraint calendars_source_check check (source in ('local', 'google', 'device'));

alter table public.events
  drop constraint events_source_check,
  add constraint events_source_check check (source in ('local', 'google', 'device'));

-- ── connections: 端末カレンダー接続は本人がクライアントから直接 INSERT する ─────

create policy "connections_insert_device"
  on public.connections for insert
  with check (user_id = (select auth.uid()) and provider = 'device');

-- ── connection_calendars: provider='device' の接続に限り authenticated の書き込みを許す ──

create policy "connection_calendars_insert_device"
  on public.connection_calendars for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.connections c
      where c.id = connection_calendars.connection_id
        and c.provider = 'device'
        and c.user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

create policy "connection_calendars_update_device"
  on public.connection_calendars for update
  using (
    exists (
      select 1
      from public.connections c
      where c.id = connection_calendars.connection_id
        and c.provider = 'device'
        and c.user_id = (select auth.uid())
        and c.deleted_at is null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.connections c
      where c.id = connection_calendars.connection_id
        and c.provider = 'device'
        and c.user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );
