-- cron ジョブに apikey ヘッダを追加する(Story 3.3 の pg_cron 配線の修正)。
--
-- Supabase の関数ゲートウェイは Authorization だけでなく apikey ヘッダも要求する。
-- 20260913000100 の cron.schedule には apikey が無く、実行時に
-- UNAUTHORIZED_INVALID_JWT_FORMAT / 401 になっていた(実機で確認)。
-- cron.schedule は同名ジョブを上書きするので、ここで正しい本文に貼り替える。

select cron.schedule(
  'sync-google-calendars',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/sync-calendars',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('scheduled', true)
  );
  $cron$
);
