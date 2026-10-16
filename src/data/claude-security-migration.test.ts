// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('参照偽装を拒否し、他人の秘密と予定を保護する', async () => {
  const db = new PGlite();
  try {
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
        (f) => f.endsWith('.sql') && !f.includes('cron') && !f.includes('scheduler_auth'),
      )
      .sort()) {
      await db.exec(
        readFileSync(`supabase/migrations/${file}`, 'utf8').replace(
          /create extension if not exists supabase_vault;/g,
          '',
        ),
      );
    }
    const a = '10000000-0000-4000-8000-000000000001';
    const b = '10000000-0000-4000-8000-000000000002';
    const scalar = async (sql: string, p: unknown[] = []) =>
      Object.values((await db.query(sql, p)).rows[0] as Record<string, unknown>)[0] as string;
    await db.query('insert into auth.users(id) values($1),($2)', [a, b]);
    const conn = await scalar(
      "select upsert_google_connection($1,'synthetic-token','b@example.test')",
      [b],
    );
    const secret = await scalar('select vault_secret_id from connections where id=$1', [conn]);
    const ca = await scalar(
      "insert into calendars(user_id,name,color) values($1,'A','#112233') returning id",
      [a],
    );
    const cb = await scalar(
      "insert into calendars(user_id,name,color,source,external_connection_id,external_calendar_id) values($1,'B','#112233','google',$2,'b-cal') returning id",
      [b, conn],
    );
    await db.exec(
      'grant usage on schema public,auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated',
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.exec('set role authenticated');
    await expect(
      db.query(
        "insert into connections(user_id,provider,vault_secret_id) values($1,'device',$2)",
        [a, secret],
      ),
    ).rejects.toThrow();
    const device = await scalar(
      "insert into connections(user_id,provider) values($1,'device') returning id",
      [a],
    );
    await expect(
      db.query('select disconnect_google_connection($1)', [device]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into events(user_id,calendar_id,title,all_day,event_date,source,connection_id,external_id) values($1,$2,'偽装',true,'2026-10-15','google',$3,'shared-id')",
        [a, ca, conn],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into events(user_id,calendar_id,title,all_day,event_date,source,connection_id,external_id) values($1,$2,'偽装',true,'2026-10-15','device',$3,'shared-id')",
        [a, ca, conn],
      ),
    ).rejects.toThrow();
    const dc = await scalar(
      "insert into calendars(user_id,name,color,source,external_connection_id,external_calendar_id) values($1,'端末','#112233','device',$2,'device-cal') returning id",
      [a, device],
    );
    await db.query(
      "insert into events(user_id,calendar_id,title,all_day,event_date,source,connection_id,external_id) values($1,$2,'端末予定',true,'2026-10-15','device',$3,'device-id')",
      [a, dc, device],
    );
    await db.exec('reset role');
    await expect(
      db.query("select apply_calendar_sync($1,$2,$3,'b-cal','[]','2026-10-01','2026-11-01')", [
        a,
        conn,
        cb,
      ]),
    ).rejects.toThrow();
    await db.query(
      "select apply_calendar_sync($1,$2,$3,'b-cal',$4::jsonb,'2026-10-01','2026-11-01')",
      [
        b,
        conn,
        cb,
        JSON.stringify([
          {
            external_id: 'shared-id',
            title: 'Bの予定',
            all_day: true,
            event_date: '2026-10-15',
            note: 'Bのメモ',
          },
        ]),
      ],
    );
    expect(await scalar('select user_id from events where connection_id=$1', [conn])).toBe(b);
    await db.exec('set role authenticated');
    await db.query('select delete_my_account()');
    await db.exec('reset role');
    expect(await scalar('select id from vault.secrets where id=$1', [secret])).toBe(secret);
    expect(await scalar('select title from events where connection_id=$1', [conn])).toBe(
      'Bの予定',
    );
  } finally {
    await db.close();
  }
}, 30_000);
