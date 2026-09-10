-- Google カレンダー定期取り込みの pg_cron 配線(Story 3.3)。
-- スキーマ変更(20260913000000)とは別ファイルにして、pg_cron / pg_net の
-- 有効化に失敗しても events / sync_state のスキーマは適用済みで残るようにする。

-- ── pg_cron: 30分ごとに sync-calendars を service_role で起動 ─────────────────────
--
-- cron ジョブは Vault の project_url / service_role_key を読む。この2値は
-- Ryo が Supabase の SQL エディタで1回登録する(docs/google-connection-setup.md 参照):
--   select vault.create_secret('https://gcjcrztzjzhbcjpigdvj.supabase.co', 'project_url');
--   select vault.create_secret('<service_role key>', 'service_role_key');
-- 未登録でも schedule 自体は作れる(ジョブ実行時に静かに失敗 → 登録後は次回から動く)。
-- create extension が権限で失敗する環境は Dashboard → Database → Extensions で
-- pg_cron / pg_net を有効化してから再 db push。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-google-calendars',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/sync-calendars',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $cron$
);
