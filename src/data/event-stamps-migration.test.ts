// @vitest-environment node
// PostgresのWASMはブラウザー模擬環境ではなくNodeの標準APIで実行する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { EVENT_STAMPS } from '@/lib/event-stamps';

describe('予定スタンプ移行', () => {
  it('固定IDをタグ・予定の両方へ適用し、既存予定の既定表示を保持する', () => {
    const sql = readFileSync('supabase/migrations/20261006000000_event_stamps.sql', 'utf8');
    expect(sql).toContain('alter table public.event_tags add column stamp_id text');
    expect(sql).toContain('alter table public.events add column stamp_id text');
    expect(sql).toContain('stamp_only boolean not null default false');
    expect(sql).toContain('char_length(trim(name)) = 0 and stamp_id is not null');
    const allowlists = [...sql.matchAll(/in\x20\(([\s\S]*?)\n\x20\x20\)/g)].map(
      (match) => match[1],
    );
    expect(allowlists).toHaveLength(2);
    const expected = EVENT_STAMPS.map(([id]) => `'${id}'`).join(',');
    for (const allowlist of allowlists)
      expect(allowlist?.replace(/\s/g, '').replace(/,\s*/g, ',')).toContain(expected);
  });

  it('Postgres制約が既存値を保ち、名称なし+固定IDだけを許可する', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.event_tags (
          name text not null constraint event_tags_name_check check (char_length(trim(name)) between 1 and 200)
        );
        create table public.events (title text not null);
        insert into public.event_tags(name) values ('既存タグ');
        insert into public.events(title) values ('既存予定');
      `);
      const migration = readFileSync(
        'supabase/migrations/20261006000000_event_stamps.sql',
        'utf8',
      );
      await db.exec(migration);

      const oldTag = await db.query<{ name: string; stamp_id: string | null }>(
        'select name, stamp_id from public.event_tags',
      );
      expect(oldTag.rows).toEqual([{ name: '既存タグ', stamp_id: null }]);
      const oldEvent = await db.query<{
        title: string;
        stamp_id: string | null;
        stamp_only: boolean;
      }>('select title, stamp_id, stamp_only from public.events');
      expect(oldEvent.rows).toEqual([
        { title: '既存予定', stamp_id: null, stamp_only: false },
      ]);

      await db.query("insert into public.event_tags(name, stamp_id) values ('', 'work')");
      await expect(
        db.query("insert into public.event_tags(name) values ('')"),
      ).rejects.toThrow();
      await expect(
        db.query("insert into public.event_tags(name, stamp_id) values ('', 'arbitrary')"),
      ).rejects.toThrow();
      await db.query(
        "insert into public.events(title, stamp_id, stamp_only) values ('仕事', 'work', true)",
      );
      await expect(
        db.query("insert into public.events(title, stamp_id) values ('unknown', 'arbitrary')"),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
