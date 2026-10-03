-- 再送・オフライン復帰後の反映を端末の起動状態に依存させない。
select cron.schedule('push-google-events','* * * * *',$cron$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/push-events',
  headers := jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'),
   'apikey',(select decrypted_secret from vault.decrypted_secrets where name='service_role_key')),
  body := '{"scheduled":true}'::jsonb,
  timeout_milliseconds := 120000
 );
$cron$);
