// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema vault; create schema extensions;
    create table auth.users(id uuid primary key,is_anonymous boolean default false,raw_user_meta_data jsonb default '{}',email text);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text,name text,description text);
    create view vault.decrypted_secrets as select id,secret as decrypted_secret,name from vault.secrets;
    create function vault.create_secret(s text,n text,d text) returns uuid language sql as $$insert into vault.secrets(secret,name,description) values(s,n,d) returning id$$;`);
  for (const file of readdirSync('supabase/migrations')
    .filter(
      (file) =>
        file.endsWith('.sql') && !file.includes('cron') && !file.includes('scheduler_auth'),
    )
    .sort()) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
        /create extension if not exists supabase_vault;/g,
        '',
      ),
    );
  }
}, 30_000);
afterAll(async () => {
  await db.close();
});
const scalar = async (sql: string, params: unknown[] = []) =>
  Object.values((await db.query(sql, params)).rows[0] as Record<string, unknown>)[0];
const newUser = async () =>
  String(await scalar('insert into auth.users(id) values(gen_random_uuid()) returning id'));
const calendar = async (user: string) =>
  String(
    await scalar(
      "insert into calendars(user_id,name,color) values($1,'予定','#0072B2') returning id",
      [user],
    ),
  );

it('同じGoogleイベントIDを別カレンダーに保存し、片側の削除で他方を消さない', async () => {
  const user = await newUser();
  const conn = await scalar(
    "select upsert_google_connection($1,'synthetic','a@example.test')",
    [user],
  );
  const ids: string[] = [];
  for (const name of ['A', 'B']) {
    const id = String(
      await scalar(
        "insert into calendars(user_id,name,color,source,external_connection_id,external_calendar_id) values($1,$2,'#0072B2','google',$3,$2) returning id",
        [user, name, conn],
      ),
    );
    ids.push(id);
    await db.query(
      "select apply_calendar_sync($1,$2,$3,$4,$5::jsonb,'2026-10-01','2026-11-01')",
      [
        user,
        conn,
        id,
        name,
        JSON.stringify([
          { external_id: 'shared', title: name, all_day: true, event_date: '2026-10-15' },
        ]),
      ],
    );
  }
  expect(
    (await db.query('select title from events where connection_id=$1 order by title', [conn]))
      .rows,
  ).toEqual([{ title: 'A' }, { title: 'B' }]);
  await db.query("select apply_calendar_sync($1,$2,$3,'A','[]','2026-10-01','2026-11-01')", [
    user,
    conn,
    ids[0],
  ]);
  expect(
    (
      await db.query(
        'select title from events where connection_id=$1 and deleted_at is null',
        [conn],
      )
    ).rows,
  ).toEqual([{ title: 'B' }]);
});

it('反映先移動は旧leaseを維持して削除を再送し、失効中も後始末できる', async () => {
  const user = await newUser();
  const conn = await scalar(
    "select upsert_google_connection($1,'synthetic','b@example.test',true)",
    [user],
  );
  await db.query(
    "insert into entitlements(user_id,entitlement,expires_at) values($1,'calendar_write',now()+interval '1 day')",
    [user],
  );
  const x = await calendar(user),
    y = await calendar(user),
    z = await calendar(user);
  await db.query("select set_google_push_target($1,$2,$3,'G1')", [user, x, conn]);
  await db.query("select set_google_push_target($1,$2,$3,'G2')", [user, z, conn]);
  const event = await scalar(
    "insert into events(user_id,calendar_id,title,all_day,event_date) values($1,$2,'移動',true,'2026-10-15') returning id",
    [user, x],
  );
  const ready = () =>
    db.query(
      "update event_google_links set next_attempt_at=now()-interval '1 second' where event_id=$1",
      [event],
    );
  const claim = async () =>
    (
      await db.query<{ job: Record<string, unknown> }>(
        'select claim_google_push($1,$2) as job',
        [user, event],
      )
    ).rows.map((row) => row.job);
  const finish = (job: Record<string, unknown>, state: string, error: string | null = null) =>
    db.query('select finish_google_push($1,$2,$3,$4,$5,$6)', [
      job.id,
      job.lease_id,
      job.revision,
      state,
      state !== 'deleted',
      error,
    ]);
  await ready();
  const old = (await claim())[0]!;
  await db.query('update events set calendar_id=$1 where id=$2', [z, event]);
  expect(await scalar('select lease_id from event_google_links where id=$1', [old.id])).toBe(
    old.lease_id,
  );
  await ready();
  const fresh = await claim();
  expect(fresh).toHaveLength(1);
  expect(fresh[0]?.google_calendar_id).toBe('G2');
  await finish(fresh[0]!, 'synced');
  await finish(old, 'synced');
  await ready();
  const removal = (await claim())[0]!;
  expect(removal.google_calendar_id).toBe('G1');
  expect(removal.remove).toBe(true);
  await finish(removal, 'deleted');
  await db.query('update events set calendar_id=$1 where id=$2', [y, event]);
  await db.query(
    "update entitlements set expires_at=now()-interval '1 day' where user_id=$1",
    [user],
  );
  await ready();
  const unpaidRemoval = await claim();
  expect(unpaidRemoval).toHaveLength(1);
  expect(unpaidRemoval[0]).toMatchObject({ google_calendar_id: 'G2', remove: true });
  await finish(unpaidRemoval[0]!, 'deleted');
  await db.query(
    "update entitlements set expires_at=now()+interval '1 day' where user_id=$1",
    [user],
  );
  await db.query('update events set calendar_id=$1 where id=$2', [x, event]);
  await ready();
  const invalid = (await claim())[0]!;
  await finish(invalid, 'error', 'invalid-event');
  expect(
    await scalar(
      "select next_attempt_at='infinity'::timestamptz from event_google_links where id=$1",
      [invalid.id],
    ),
  ).toBe(true);
  expect(await claim()).toHaveLength(0);
  await db.query("update events set title='修正済み' where id=$1", [event]);
  await ready();
  expect(await claim()).toHaveLength(1);
});

it('移転先行は再送可能な失敗にし、後着購入後に移転して古い移転では復活させない', async () => {
  const a = await newUser(),
    b = await newUser();
  await expect(
    db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]),
  ).rejects.toThrow('transfer source not ready');
  await db.query(
    "select apply_revenuecat_entitlement($1,'calendar_write','2030-01-01','monthly','app_store',100)",
    [a],
  );
  expect(await scalar('select apply_revenuecat_transfer($1,$2,200)', [a, b])).toBe(true);
  expect(
    await scalar('select expires_at<=now() from entitlements where user_id=$1', [a]),
  ).toBe(true);
  expect(await scalar('select expires_at>now() from entitlements where user_id=$1', [b])).toBe(
    true,
  );
  expect(await scalar('select apply_revenuecat_transfer($1,$2,200)', [a, b])).toBe(false);
  await db.query(
    "select apply_revenuecat_entitlement($1,'calendar_write','2030-02-01','monthly','app_store',300)",
    [a],
  );
  expect(await scalar('select apply_revenuecat_transfer($1,$2,250)', [a, b])).toBe(false);
  expect(
    await scalar('select last_event_ms::int from entitlements where user_id=$1', [a]),
  ).toBe(300);
});

const grant = (user: string, entitlement: string, expires: string, eventMs: number) =>
  scalar("select apply_revenuecat_entitlement($1,$2,$3,'monthly','app_store',$4)", [
    user,
    entitlement,
    expires,
    eventMs,
  ]);
const active = async (user: string, entitlement: string) =>
  scalar(
    'select coalesce(bool_or(expires_at is null or expires_at>now()),false) from entitlements where user_id=$1 and entitlement=$2',
    [user, entitlement],
  );

it('削除した移転元の履歴を残さず、古い購入通知も移転先へ付与しない', async () => {
  const a = await newUser(),
    b = await newUser();
  await grant(a, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  await db.query('delete from auth.users where id=$1', [a]);
  expect(
    await scalar('select count(*)::int from revenuecat_transfers where from_user=$1', [a]),
  ).toBe(0);
  expect(await grant(a, 'multi_account', '2030-01-01', 150)).toBe(false);
  expect(await active(b, 'multi_account')).toBe(false);
});

it('移転先削除で識別子を消し、後着購入を移転元へ戻さない', async () => {
  const a = await newUser(),
    b = await newUser();
  await grant(a, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  await db.query('delete from auth.users where id=$1', [b]);
  expect(
    await scalar('select to_user from revenuecat_transfers where from_user=$1', [a]),
  ).toBeNull();
  expect(await grant(a, 'multi_account', '2030-01-01', 150)).toBe(false);
  expect(await active(a, 'multi_account')).toBe(false);
});

it('同時刻の循環移転は途中の人に付与せず再送可能な失敗にする', async () => {
  const a = await newUser(),
    b = await newUser();
  await db.query(
    'insert into revenuecat_transfers(from_user,to_user,event_ms) values($1,$2,200),($2,$1,200)',
    [a, b],
  );
  await expect(grant(a, 'multi_account', '2030-01-01', 100)).rejects.toThrow('transfer route');
  expect(await active(a, 'multi_account')).toBe(false);
  expect(await active(b, 'multi_account')).toBe(false);
});

it('同時刻に移転先が複数あればUUID順に選ばず失敗にする', async () => {
  const a = await newUser(),
    b = await newUser(),
    c = await newUser();
  await db.query(
    'insert into revenuecat_transfers(from_user,to_user,event_ms) values($1,$2,200),($1,$3,200)',
    [a, b, c],
  );
  await expect(grant(a, 'multi_account', '2030-01-01', 100)).rejects.toThrow('transfer route');
  for (const user of [a, b, c]) expect(await active(user, 'multi_account')).toBe(false);
});

it('移転追跡の上限を超えても途中の利用者へ付与しない', async () => {
  const users: string[] = [];
  for (let i = 0; i < 34; i++) users.push(await newUser());
  for (let i = 0; i < 33; i++)
    await db.query(
      'insert into revenuecat_transfers(from_user,to_user,event_ms) values($1,$2,$3)',
      [users[i], users[i + 1], 200 + i],
    );
  await expect(grant(users[0]!, 'multi_account', '2030-01-01', 100)).rejects.toThrow(
    'transfer route',
  );
  expect(
    await scalar(
      "select count(*)::int from entitlements where user_id=any($1::uuid[]) and entitlement='multi_account'",
      [users],
    ),
  ).toBe(0);
});

it('BからCへの移転が先着しても後着のAからBへの移転を最終Cへ渡す', async () => {
  const a = await newUser(),
    b = await newUser(),
    c = await newUser();
  await grant(b, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,300)', [b, c]);
  await grant(a, 'multi_account', '2030-01-01', 100);
  expect(await scalar('select apply_revenuecat_transfer($1,$2,200)', [a, b])).toBe(true);
  expect(await active(a, 'multi_account')).toBe(false);
  expect(await active(b, 'multi_account')).toBe(false);
  expect(await active(c, 'multi_account')).toBe(true);
});

it('移転前に発生した同じ権利の後着更新を移転先に反映し、新しい失効は守る', async () => {
  const a = await newUser(),
    b = await newUser();
  await grant(a, 'calendar_write', '2028-01-01', 50);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  expect(await grant(a, 'calendar_write', '2030-01-01', 150)).toBe(true);
  expect(
    await scalar(
      "select expires_at='2030-01-01'::timestamptz from entitlements where user_id=$1 and entitlement='calendar_write'",
      [b],
    ),
  ).toBe(true);
  await grant(b, 'calendar_write', '2020-01-01', 400);
  expect(await grant(a, 'calendar_write', '2030-01-01', 150)).toBe(false);
  expect(await active(b, 'calendar_write')).toBe(false);
});

it('時刻順にAへ戻った移転では古い移転再送で最終所有者Aを失効しない', async () => {
  const a = await newUser(),
    b = await newUser();
  await grant(a, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  await db.query('select apply_revenuecat_transfer($1,$2,300)', [b, a]);
  expect(await active(a, 'calendar_write')).toBe(true);
  await grant(a, 'multi_account', '2030-01-01', 150);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  expect(await active(a, 'multi_account')).toBe(true);
  expect(await active(b, 'multi_account')).toBe(false);
});

it('逆順移転でも最終移転先の長い期限を短縮しない', async () => {
  const a = await newUser(),
    b = await newUser(),
    c = await newUser();
  await grant(b, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,300)', [b, c]);
  await grant(c, 'multi_account', '2035-01-01', 400);
  await grant(a, 'multi_account', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  expect(
    await scalar(
      "select expires_at='2035-01-01'::timestamptz and last_event_ms=400 from entitlements where user_id=$1 and entitlement='multi_account'",
      [c],
    ),
  ).toBe(true);
  expect(await active(b, 'multi_account')).toBe(false);
});

it('期限切れ行だけの移転元へ先着した移転後、後着の古い購入は移転先へ付与する', async () => {
  const a = await newUser(),
    b = await newUser();
  await grant(a, 'calendar_write', '2020-01-01', 50);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  expect(await grant(a, 'multi_account', '2030-01-01', 100)).toBe(true);
  expect(await active(a, 'multi_account')).toBe(false);
  expect(await active(b, 'multi_account')).toBe(true);
  // 同じ通知の再送でも元利用者へ復活させない。
  await grant(a, 'multi_account', '2030-01-01', 100);
  expect(await active(a, 'multi_account')).toBe(false);
});

it('有効な権利の移転後に後着した古い購入は移転先へ付与し、移転先の新しい状態は上書きしない', async () => {
  const a = await newUser(),
    b = await newUser();
  await grant(a, 'calendar_write', '2030-01-01', 100);
  expect(await scalar('select apply_revenuecat_transfer($1,$2,200)', [a, b])).toBe(true);
  await grant(a, 'multi_account', '2030-01-01', 150);
  expect(await active(a, 'multi_account')).toBe(false);
  expect(await active(b, 'multi_account')).toBe(true);
  expect(await active(a, 'calendar_write')).toBe(false);
  // Bの新しい失効を、古いA宛て通知の再送で戻さない。
  await grant(b, 'multi_account', '2020-01-01', 400);
  expect(await grant(a, 'multi_account', '2030-01-01', 150)).toBe(false);
  expect(await active(b, 'multi_account')).toBe(false);
  expect(await active(a, 'multi_account')).toBe(false);
  // 移転より新しいA自身の購入はAへ付与する。
  await grant(a, 'multi_account', '2030-01-01', 500);
  expect(await active(a, 'multi_account')).toBe(true);
});

it('A→B→Cの連続移転では最終移転先へ、移転順が逆なら途中で止めて付与する', async () => {
  const a = await newUser(),
    b = await newUser(),
    c = await newUser();
  await grant(a, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [a, b]);
  await db.query('select apply_revenuecat_transfer($1,$2,300)', [b, c]);
  await grant(a, 'multi_account', '2030-01-01', 150);
  expect(await active(a, 'multi_account')).toBe(false);
  expect(await active(b, 'multi_account')).toBe(false);
  expect(await active(c, 'multi_account')).toBe(true);

  const d = await newUser(),
    e = await newUser(),
    f = await newUser();
  await grant(e, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,150)', [e, f]);
  await grant(d, 'calendar_write', '2030-01-01', 100);
  await db.query('select apply_revenuecat_transfer($1,$2,200)', [d, e]);
  // D宛ての通知はEへ移った時点(200)より前のE→F移転(150)を辿らない。
  await grant(d, 'multi_account', '2030-01-01', 120);
  expect(await active(e, 'multi_account')).toBe(true);
  expect(await active(f, 'multi_account')).toBe(false);
});

it('移転記録はクライアントから読めず、移転・付与RPCはservice_role専用のまま', async () => {
  expect(
    await scalar(
      "select relrowsecurity from pg_class where oid='public.revenuecat_transfers'::regclass",
    ),
  ).toBe(true);
  for (const role of ['anon', 'authenticated']) {
    expect(
      await scalar("select has_table_privilege($1,'public.revenuecat_transfers','select')", [
        role,
      ]),
    ).toBe(false);
    for (const fn of [
      'public.apply_revenuecat_transfer(uuid,uuid,bigint)',
      'public.revenuecat_transfer_target(uuid,bigint)',
      'public.apply_revenuecat_entitlement(uuid,text,timestamptz,text,text,bigint)',
    ]) {
      expect(
        await scalar('select has_function_privilege($1,$2,$3)', [role, fn, 'execute']),
      ).toBe(false);
    }
  }
  expect(
    await scalar(
      "select has_function_privilege('service_role','public.revenuecat_transfer_target(uuid,bigint)','execute')",
    ),
  ).toBe(false);
  expect(
    await scalar(
      "select has_function_privilege('service_role','public.apply_revenuecat_entitlement(uuid,text,timestamptz,text,text,bigint)','execute')",
    ),
  ).toBe(true);
});

it('初回シフト作成時だけマイカレンダーを1件作り、既存・削除済み通常カレンダーを重複作成しない', async () => {
  const user = await newUser();
  const shift = await scalar(
    "insert into calendars(user_id,name,color,is_shift) values($1,'シフト','#009E73',true) returning id",
    [user],
  );
  expect(
    await scalar(
      "select count(*)::int from calendars where user_id=$1 and name='マイカレンダー'",
      [user],
    ),
  ).toBe(1);
  await expect(
    db.query(
      "insert into calendars(user_id,name,color,is_shift) values($1,'シフト','#009E73',true)",
      [user],
    ),
  ).rejects.toThrow();
  await db.query('update calendars set deleted_at=now() where user_id=$1', [user]);
  await db.query('update calendars set deleted_at=null where id=$1', [shift]);
  expect(
    await scalar(
      "select count(*)::int from calendars where user_id=$1 and name='マイカレンダー'",
      [user],
    ),
  ).toBe(1);
  const existingUser = await newUser();
  await calendar(existingUser);
  await db.query(
    "insert into calendars(user_id,name,color,is_shift) values($1,'シフト','#009E73',true)",
    [existingUser],
  );
  expect(
    await scalar(
      "select count(*)::int from calendars where user_id=$1 and name='マイカレンダー'",
      [existingUser],
    ),
  ).toBe(0);
});
