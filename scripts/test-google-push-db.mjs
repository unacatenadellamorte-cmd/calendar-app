// 実Postgresエンジン(PGlite)でSQLを検証。Vaultの暗号化とcron通信は外部依存として置き換える。
// PGLITE_MODULEに一時ディレクトリへインストールしたpgliteのindex.jsを指定する。
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema vault; create schema extensions;
 create table auth.users(id uuid primary key, is_anonymous boolean default false, raw_user_meta_data jsonb default '{}',email text);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
 create table vault.secrets(id uuid primary key default gen_random_uuid(), secret text,name text,description text);
 create view vault.decrypted_secrets as select id,secret as decrypted_secret,name from vault.secrets;
 create function vault.create_secret(s text,n text,d text) returns uuid language sql as $$insert into vault.secrets(secret,name,description) values(s,n,d) returning id$$;`);
for (const file of readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql') && !f.includes('cron') && !f.includes('scheduler_auth')).sort()) {
  let sql=readFileSync(join(root,'supabase/migrations',file),'utf8');
  sql=sql.replace(/create extension if not exists supabase_vault;/g,'');
  try { await db.exec(sql); }
  catch(e) { console.error(`失敗したマイグレーション: ${file}`); throw e; }
}
const user='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const scalar=async(sql,params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
await db.query('insert into auth.users(id) values($1),($2)',[user,other]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
const conn=await scalar("select upsert_google_connection($1,'token-a','a@example.test')",[user]);
await assert.rejects(()=>db.query("select upsert_google_connection($1,'token-b','b@example.test')",[user]));
await db.query("insert into entitlements(user_id,entitlement,expires_at) values($1,'multi_account',now()+interval '1 day')",[user]);
const conn2=await scalar("select upsert_google_connection($1,'token-b','b@example.test')",[user]);
for (let n=3;n<=5;n++) await scalar("select upsert_google_connection($1,'token','account-'||$2||'@example.test',true)",[user,String(n)]);
await assert.rejects(()=>db.query("select upsert_google_connection($1,'token','six@example.test')",[user]));
await db.query("select upsert_google_connection($1,'token-b','b@example.test',true)",[user]);
assert.equal(await scalar('select write_granted from connections where id=$1',[conn2]),true);
assert.equal(await scalar('select get_google_connection_token($1,$2)',[user,conn2]),'token-b');
assert.equal(await scalar('select get_google_connection_token($1,$2)',[other,conn2]),null);
assert.equal(await scalar('select get_google_refresh_token($1)',[user]),null);
await db.query('update connections set write_granted=true where user_id=$1',[user]);
const calendar=await scalar("insert into calendars(user_id,name,color) values($1,'検証','#112233') returning id",[user]);
await db.query("select set_google_push_target($1,$2,$3,'calendar-a')",[user,calendar,conn]);
const event=await scalar("insert into events(user_id,calendar_id,title,all_day,event_date) values($1,$2,'検証予定',true,'2026-10-03') returning id",[user,calendar]);
assert.equal(await scalar('select count(*)::int from event_google_links'),1);
assert.equal((await db.query('select claim_google_push($1)',[user])).rows.length,0);
await db.query("update event_google_links set next_attempt_at=now()-interval '1 second'");
let jobs=(await db.query('select claim_google_push($1) as job',[user])).rows;
assert.equal(jobs.length,1);
let job=jobs[0].job;
assert.equal((await db.query('select claim_google_push($1)',[user])).rows.length,0);
// 送信中に秘密へ変更された場合は完了で上書きせず、削除を再キューする。
await db.query('update events set is_secret=true where id=$1',[event]);
await db.query("select finish_google_push($1,$2,$3,'synced',true)",[job.id,job.lease_id,job.revision]);
assert.equal(await scalar('select state from event_google_links'),'pending');
await db.query("update entitlements set expires_at=now()-interval '1 day' where user_id=$1",[user]);
await db.query('select reconcile_google_connections($1)',[user]);
assert.equal(await scalar('select status from connections where id=$1',[conn2]),'suspended');
await db.query("update event_google_links set next_attempt_at=now()-interval '1 second'");
jobs=(await db.query('select claim_google_push($1) as job',[user])).rows;
assert.equal(jobs.length,1);
assert.equal(jobs[0].job.remove,true);
assert.equal(jobs[0].job.secret_cleanup,true);
job=jobs[0].job;
await db.query("select finish_google_push($1,$2,$3,'deleted',false)",[job.id,job.lease_id,job.revision]);
assert.equal(await scalar('select state from event_google_links'),'deleted');
await db.query('update events set is_secret=false where id=$1',[event]);
await db.query("update event_google_links set next_attempt_at=now()-interval '1 second'");
assert.equal((await db.query('select claim_google_push($1)',[user])).rows.length,0);
// SELECT権利と書き込み禁止の確認。
await db.exec('grant usage on schema public,auth to authenticated; set role authenticated;');
assert.equal(await scalar('select count(*)::int from event_google_links'),1);
await assert.rejects(()=>db.query("update event_google_links set state='synced'"));
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
assert.equal(await scalar('select count(*)::int from event_google_links'),0);
await db.exec('reset role;');
// 停止済み反映先の先頭3件が、後続の有効な予定をふさがない。
await db.query("update entitlements set expires_at=now()+interval '1 day' where user_id=$1",[user]);
await db.query("insert into events(user_id,calendar_id,title,all_day,event_date) select $1,$2,'旧反映先',true,'2026-10-03' from generate_series(1,3)",[user,calendar]);
await db.query("select set_google_push_target($1,$2,$3,'calendar-b')",[user,calendar,conn]);
assert.equal(await scalar("select count(*)::int from event_google_links where google_calendar_id='calendar-a' and state='paused'"),4);
// 旧バージョンや送信中競合でpendingが残っても先頭をふさがない。
await db.query("update event_google_links set state='pending' where google_calendar_id='calendar-a'");
await db.query("update event_google_links set next_attempt_at=now()-case when google_calendar_id='calendar-a' then interval '1 day' else interval '1 second' end");
jobs=(await db.query('select claim_google_push($1) as job',[user])).rows;
assert.equal(jobs.length,3);
assert.ok(jobs.every(row=>row.job.google_calendar_id==='calendar-b'));
// 秘密コピーの削除中に秘密を解除しても、削除済みIDを再利用しない。
await db.query("update event_google_links set lease_id=null,lease_until=null,state='synced',remote_present=true");
await db.query('update events set is_secret=true where id=$1',[event]);
await db.query("update event_google_links set next_attempt_at=now()-interval '1 second'");
jobs=(await db.query('select claim_google_push($1) as job',[user])).rows;
job=jobs.find(row=>row.job.google_calendar_id==='calendar-b').job;
await db.query('update events set is_secret=false where id=$1',[event]);
await db.query("select finish_google_push($1,$2,$3,'deleted',false)",[job.id,job.lease_id,job.revision]);
const after=(await db.query('select state,google_event_id,remote_present from event_google_links where id=$1',[job.id])).rows[0];
assert.equal(after.state,'pending');
assert.equal(after.remote_present,false);
assert.notEqual(after.google_event_id,job.google_event_id);
// 反映を止めたあとにカレンダーを削除しても、送信済みコピーを削除対象へ戻す。
await db.query("update event_google_links set lease_id=null,lease_until=null,state='synced'");
await db.query('select set_google_push_target($1,$2,null,null)',[user,calendar]);
await db.query('update calendars set deleted_at=now() where id=$1',[calendar]);
assert.equal(await scalar("select count(*)::int from event_google_links where state<>'pending'"),0);
await db.query("update event_google_links set next_attempt_at=now()-interval '1 second'");
jobs=(await db.query('select claim_google_push($1,$2) as job',[user,event])).rows;
assert.ok(jobs.length>0 && jobs.every(row=>row.job.remove && row.job.event_id===event));
job=jobs[0].job;
await db.query("update event_google_links set failure_count=4 where id=$1",[job.id]);
await db.query("select finish_google_push($1,$2,$3,'error',true,'reauth-needed')",[job.id,job.lease_id,job.revision]);
assert.ok(await scalar("select next_attempt_at>now()+interval '30 minutes' from event_google_links where id=$1",[job.id]));
await db.query('delete from auth.users where id=$1',[user]);
assert.equal(await scalar('select count(*)::int from event_google_links'),0);
console.log('SQL検証成功: 接続分離・上限・猶予・排他・秘密化競合・失効・RLS・連鎖削除');
await db.close();
