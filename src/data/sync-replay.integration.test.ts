import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enqueue, listOutbox } from './outbox';
import { cacheGetAll } from './cache';

const server = vi.hoisted(() => ({
  events: new Map<string, Record<string, unknown>>(),
  calendars: new Map<string, Record<string, unknown>>(),
  fail: '' as string,
  deliveredThenLost: '' as string,
  offlineAfterValidation: false,
  listGate: null as Promise<void> | null,
  listStarted: null as (() => void) | null,
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
      let rangeStart = 0;
      let rangeEnd = Number.POSITIVE_INFINITY;
      let limitCount: number | null = null;
      const filters: [string, unknown][] = [];
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: (count: number) => {
          limitCount = count;
          return chain;
        },
        range: (from: number, to: number) => {
          rangeStart = from;
          rangeEnd = to;
          return chain;
        },
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
            .then(async () => {
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
                const id = String(payload.id ?? crypto.randomUUID());
                if (rows.has(id))
                  return { data: null, error: { code: '23505', message: 'duplicate' } };
                const row = {
                  created_at: '',
                  updated_at: '',
                  deleted_at: null,
                  ...(table === 'calendars'
                    ? { is_shift: false, is_visible: true, priority: 0 }
                    : {}),
                  ...payload,
                  id,
                };
                rows.set(id, row);
                server.writes.push(`${table}:create`);
                data = row;
              } else if (operation === 'update') {
                for (const row of matching) Object.assign(row, payload);
                server.writes.push(
                  `${table}:${payload.deleted_at ? 'delete' : (payload.title ?? payload.name)}`,
                );
                data = matching[0] ?? null;
              } else {
                data = single
                  ? (matching[0] ?? null)
                  : matching.slice(rangeStart, limitCount === null ? rangeEnd + 1 : rangeStart + limitCount);
              }
              if (name === 'events:select' && !single && server.listGate) {
                const gate = server.listGate;
                server.listGate = null;
                server.listStarted?.();
                await gate;
              }
              if (server.deliveredThenLost === name) {
                server.deliveredThenLost = '';
                return { data: null, error: new TypeError('Failed to fetch') };
              }
              if (name === 'calendars:select' && server.offlineAfterValidation) {
                server.offlineAfterValidation = false;
                vi.stubGlobal('navigator', { onLine: false });
              }
              return { data, count: single ? null : matching.length, error: null };
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
const { createEvent, listEvents, deleteEvent, updateEvent } = await import('./events');
beforeEach(() => {
  server.events.clear();
  server.calendars.clear();
  server.writes.length = 0;
  server.fail = '';
  server.deliveredThenLost = '';
  server.offlineAfterValidation = false;
  server.listGate = null;
  server.listStarted = null;
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

it.each(['create', 'update', 'delete'] as const)(
  '一覧取得前から未送信の%sも古いサーバー一覧で消さない',
  async (operation) => {
    await createCalendar({ id: 'cached-cal', name: '通常', color: '#0072B2' });
    const initial = await createEvent({
      id: 'original',
      calendarId: 'cached-cal',
      title: '保存済み',
      allDay: true,
      eventDate: '2026-10-15',
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    vi.stubGlobal('navigator', { onLine: false });
    if (operation === 'create')
      await createEvent({
        id: 'pending',
        calendarId: 'cached-cal',
        title: '未送信',
        allDay: true,
        eventDate: '2026-10-15',
      });
    if (operation === 'update') await updateEvent(initial.value, { title: '未送信の編集' });
    if (operation === 'delete') await deleteEvent(initial.value);
    vi.stubGlobal('navigator', { onLine: true });
    const result = await listEvents();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((event) => event.id).sort()).toEqual(
      operation === 'delete'
        ? []
        : operation === 'create'
          ? ['original', 'pending']
          : ['original'],
    );
    if (operation === 'update') expect(result.value[0]?.title).toBe('未送信の編集');
    vi.stubGlobal('navigator', { onLine: false });
    expect(await listEvents()).toEqual(result);
  },
);

it('初期一覧の古い応答後に切断しても、既存3件と保存した1件を読み出せる', async () => {
  for (const id of ['a', 'b', 'c'])
    server.events.set(id, {
      id,
      calendar_id: 'c1',
      source: 'local',
      title: id,
      all_day: true,
      event_date: '2026-10-15',
      created_at: '',
      updated_at: '',
    });
  let release!: () => void;
  server.listGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    server.listStarted = resolve;
  });
  const pending = listEvents();
  await started;
  const added = await createEvent({
    id: 'added',
    calendarId: 'c1',
    title: '新規',
    allDay: true,
    eventDate: '2026-10-15',
  });
  expect(added.ok).toBe(true);
  release();
  await pending;
  vi.stubGlobal('navigator', { onLine: false });
  const result = await listEvents();
  expect(result.ok && result.value.map((event) => event.id).sort()).toEqual([
    'a',
    'added',
    'b',
    'c',
  ]);
});

it('初回作成の保存応答を失ってもカレンダーIDを変えず1件だけになる', async () => {
  server.deliveredThenLost = 'calendars:insert';
  const result = await createCalendar({ name: '応答喪失', color: '#0072B2' });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const ids = () => [...server.calendars.keys()].filter((id) => id !== 'c1');
  expect(ids()).toEqual([result.value.id]);
  await flushOutbox();
  expect(ids()).toEqual([result.value.id]);
  expect(await listOutbox()).toEqual([]);
});

it('初回作成の保存応答を失っても予定IDを変えず、再送後も1件だけになる', async () => {
  server.deliveredThenLost = 'events:insert';
  const result = await createEvent({
    calendarId: 'c1',
    title: '応答喪失',
    allDay: true,
    eventDate: '2026-10-15',
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect([...server.events.keys()]).toEqual([result.value.id]);
  await flushOutbox();
  expect([...server.events.keys()]).toEqual([result.value.id]);
  expect(await listOutbox()).toEqual([]);
});

it('再送のカレンダー検証中に切断しても作成を末尾へ積み直さない', async () => {
  await enqueue({
    entity: 'event',
    op: 'create',
    targetId: 'new',
    payload: { calendarId: 'c1', title: '新規', allDay: true, eventDate: '2026-10-15' },
  });
  await enqueue({ entity: 'event', op: 'delete', targetId: 'new' });
  const before = await listOutbox();
  server.offlineAfterValidation = true;
  expect(await flushOutbox()).toEqual({ flushed: 0, dropped: 0, interrupted: true });
  expect(await listOutbox()).toEqual(before);
  vi.stubGlobal('navigator', { onLine: true });
  await flushOutbox();
  expect(server.events.get('new')?.deleted_at).toBeTruthy();
  expect(await listOutbox()).toEqual([]);
});

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
