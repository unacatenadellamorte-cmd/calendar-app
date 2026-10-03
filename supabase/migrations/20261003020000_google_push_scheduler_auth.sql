-- Authorizationはゲートウェイ処理後に値が変わり得るため、定期実行を専用秘密でも検証する。
select cron.schedule('push-google-events','* * * * *',$cron$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/push-events',
  headers := jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'),
   'apikey',(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'),
   'X-Google-Push-Secret',(select decrypted_secret from vault.decrypted_secrets where name='google_push_cron_secret')),
  body := '{"scheduled":true}'::jsonb,
  timeout_milliseconds := 120000
 );
$cron$);
