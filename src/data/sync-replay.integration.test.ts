import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enqueue, listOutbox } from './outbox';
import { cacheGetAll } from './cache';

const server = vi.hoisted(() => ({
  events: new Map<string, Record<string, unknown>>(),
  calendars: new Map<string, Record<string, unknown>>(),
  fail: '' as string,
  deliveredThenLost: '' as string,
  writes: [] as string[],
}));
vi.mock('@/platform/widget', () => ({
  refreshFeaturedWidget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./supabase', () => ({
  supabase: {
    from(table: 'events' | 'calendars') {
      let operation = 'select';
      let payload: Record<string, unknown> = {};
      let single = false;
      const filters: [string, unknown][] = [];
      const chain = {
        select: () => chain,
        insert: (value: Record<string, unknown>) => {
          operation = 'insert';
          payload = value;
          return chain;
        },
        update: (value: Record<string, unknown>) => {
          operation = 'update';
          payload = value;
          return chain;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        is: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        single: () => {
          single = true;
          return chain;
        },
        maybeSingle: () => {
          single = true;
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              const name = `${table}:${operation}`;
              if (server.fail === name) {
                server.fail = '';
                return { data: null, error: new TypeError('Failed to fetch') };
              }
              const rows = server[table];
              const matching = [...rows.values()].filter((row) =>
                filters.every(([key, value]) => (row[key] ?? null) === value),
              );
              let data: unknown;
              if (operation === 'insert') {
                if (rows.has(String(payload.id)))
                  return { data: null, error: { code: '23505', message: 'duplicate' } };
                const row = {
                  created_at: '',
                  updated_at: '',
                  deleted_at: null,
                  ...(table === 'calendars'
                    ? { is_shift: false, is_visible: true, priority: 0 }
                    : {}),
                  ...payload,
                };
                rows.set(String(payload.id), row);
                server.writes.push(`${table}:create`);
                data = row;
              } else if (operation === 'update') {
                for (const row of matching) Object.assign(row, payload);
                server.writes.push(
                  `${table}:${payload.deleted_at ? 'delete' : (payload.title ?? payload.name)}`,
                );
                data = matching[0] ?? null;
              } else data = single ? (matching[0] ?? null) : matching;
              if (server.deliveredThenLost === name) {
                server.deliveredThenLost = '';
                return { data: null, error: new TypeError('Failed to fetch') };
              }
              return { data, error: null };
            })
            .then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));
const { flushOutbox } = await import('./sync');
const { createCalendar } = await import('./calendars');
beforeEach(() => {
  server.events.clear();
  server.calendars.clear();
  server.writes.length = 0;
  server.fail = '';
  server.deliveredThenLost = '';
  server.calendars.set('c1', {
    id: 'c1',
    source: 'local',
    is_shift: false,
    name: '通常',
    color: '#0072B2',
  });
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

it('実データ層でも瞬断時はA→Bを積み直さず先頭に保持する', async () => {
  server.events.set('e1', {
    id: 'e1',
    calendar_id: 'c1',
    source: 'local',
    title: '初期',
    all_day: true,
    event_date: '2026-10-15',
  });
  for (const title of ['A', 'B'])
    await enqueue({ entity: 'event', op: 'update', targetId: 'e1', payload: { title } });
  const before = await listOutbox();
  server.fail = 'events:update';
  expect(await flushOutbox()).toEqual({ flushed: 0, dropped: 0, interrupted: true });
  expect(await listOutbox()).toEqual(before);
  expect(await flushOutbox()).toEqual({ flushed: 2, dropped: 0, interrupted: false });
  expect(server.writes).toEqual(['events:A', 'events:B']);
  expect(server.events.get('e1')?.title).toBe('B');
});

it('作成応答喪失の23505を本人IDで照合し、後続削除後に復活させない', async () => {
  await enqueue({
    entity: 'event',
    op: 'create',
    targetId: 'new',
    payload: { calendarId: 'c1', title: '新規', allDay: true, eventDate: '2026-10-15' },
  });
  await enqueue({ entity: 'event', op: 'delete', targetId: 'new' });
  const before = await listOutbox();
  server.deliveredThenLost = 'events:insert';
  expect((await flushOutbox()).interrupted).toBe(true);
  expect(await listOutbox()).toEqual(before);
  expect(await flushOutbox()).toEqual({ flushed: 2, dropped: 0, interrupted: false });
  expect(server.writes).toEqual(['events:create', 'events:delete']);
  expect(server.events.get('new')?.deleted_at).toBeTruthy();
  expect(await cacheGetAll('events')).toEqual([]);
});

it('カレンダーの作成応答喪失も順序を保ち、改名→削除まで送る', async () => {
  await enqueue({
    entity: 'calendar',
    op: 'create',
    targetId: 'c2',
    payload: { name: '新規', color: '#0072B2' },
  });
  await enqueue({
    entity: 'calendar',
    op: 'rename',
    targetId: 'c2',
    payload: { name: '変更後' },
  });
  await enqueue({ entity: 'calendar', op: 'delete', targetId: 'c2' });
  server.deliveredThenLost = 'calendars:insert';
  expect((await flushOutbox()).interrupted).toBe(true);
  expect(await listOutbox()).toHaveLength(3);
  expect(await flushOutbox()).toEqual({ flushed: 3, dropped: 0, interrupted: false });
  expect(server.writes).toEqual(['calendars:create', 'calendars:変更後', 'calendars:delete']);
  expect(server.calendars.get('c2')?.deleted_at).toBeTruthy();
});

it('同じIDが本人の通常カレンダーとして照合できない23505は成功にしない', async () => {
  server.calendars.set('c2', { id: 'c2', source: 'google', is_shift: false });
  const result = await createCalendar(
    { id: 'c2', name: '通常', color: '#0072B2' },
    { noOfflineFallback: true },
  );
  expect(result.ok).toBe(false);
  expect(server.writes).toEqual([]);
});
