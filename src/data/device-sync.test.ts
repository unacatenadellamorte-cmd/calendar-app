import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err, appError } from './result';

/**
 * device-sync.ts の検証。supabase(from チェーン)・device-connections・
 * platform/deviceCalendar をモックする。`device-calendars.test.ts` と同じ
 * responseQueue パターン(`from()` が呼ばれるたびに先頭を1つ消費)。
 *
 * `events_external_uniq` が `(connection_id, external_id) where connection_id is not null`
 * という部分ユニークインデックスのため、書き込みは `.upsert({onConflict})` を使わず
 * SELECT → 既存なら UPDATE / 無ければ INSERT の手動シーケンスになっている。
 */

interface Call {
  table: string;
  method: string;
  args: unknown[];
}
let calls: Call[] = [];
let responseQueue: unknown[] = [];

function makeBuilder(table: string) {
  const response = responseQueue.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  for (const m of ['select', 'eq', 'is', 'in', 'limit', 'returns', 'update', 'insert']) {
    chain[m] = record(m);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return chain;
}

const from = vi.fn((table: string) => makeBuilder(table));
let supabaseValue: unknown = { from };

vi.mock('./supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

const getDeviceConnection = vi.fn();
vi.mock('./device-connections', () => ({
  getDeviceConnection: (...a: unknown[]) => getDeviceConnection(...a),
}));

const listDeviceEventsInRange = vi.fn();
vi.mock('@/platform/deviceCalendar', () => ({
  listDeviceEventsInRange: (...a: unknown[]) => listDeviceEventsInRange(...a),
}));

async function load() {
  return import('./device-sync');
}

const rawEvent = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: '会議',
  description: null,
  isAllDay: false,
  startDate: Date.now(),
  endDate: Date.now() + 3_600_000,
  calendarId: 'cal-a',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls = [];
  responseQueue = [];
  from.mockClear();
  supabaseValue = { from };
  getDeviceConnection.mockReset();
  listDeviceEventsInRange.mockReset();
});

describe('syncDeviceCalendarsNow', () => {
  it('端末カレンダー未接続なら何もせず {synced:[],errors:[]}', async () => {
    getDeviceConnection.mockResolvedValue(ok(null));
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ synced: [], errors: [] });
    expect(listDeviceEventsInRange).not.toHaveBeenCalled();
  });

  it('接続の取得に失敗したらそのまま伝播する', async () => {
    getDeviceConnection.mockResolvedValue(
      err(appError('data/query', 'data/query')),
    );
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });

  it('選択済みカレンダーが0件なら何もせず {synced:[],errors:[]}', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [{ data: [], error: null }]; // connection_calendars
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ synced: [], errors: [] });
    expect(listDeviceEventsInRange).not.toHaveBeenCalled();
  });

  it('選択済みカレンダーの新規予定を正規化して INSERT する(upsert は使わない)', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [
      {
        data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }],
        error: null,
      }, // connection_calendars
      { data: [], error: null }, // 既存 external_id 検索(該当なし)
      { error: null }, // insert
      { data: [], error: null }, // 削除差分用の既存 external_id(diff用)
    ];
    listDeviceEventsInRange.mockResolvedValue([
      rawEvent({ id: 'e1', calendarId: 'cal-a' }),
      rawEvent({ id: 'e2', calendarId: 'cal-b' }), // 別カレンダー、対象外
    ]);
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.synced).toEqual([{ calendar: '仕事', upserted: 1, deleted: 0 }]);
      expect(r.value.errors).toEqual([]);
    }

    // 部分ユニークインデックスと衝突する `.upsert()` はもう使わない。
    expect(calls.some((c) => c.method === 'upsert')).toBe(false);

    const insertCall = calls.find((c) => c.table === 'events' && c.method === 'insert');
    expect(insertCall).toBeTruthy();
    const rows = insertCall?.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      external_id: 'e1',
      calendar_id: 'cal-a-id',
      connection_id: 'conn1',
      source: 'device',
    });
  });

  it('既存の予定(論理削除済み含む)は UPDATE で復活・更新する', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [
      {
        data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }],
        error: null,
      },
      { data: [{ id: 'ev1', external_id: 'e1' }], error: null }, // 既存あり(論理削除済みでも一意インデックス上は存在)
      { error: null }, // update
      { data: [], error: null }, // 削除差分用の既存 external_id
    ];
    listDeviceEventsInRange.mockResolvedValue([rawEvent({ id: 'e1', calendarId: 'cal-a' })]);
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.synced).toEqual([{ calendar: '仕事', upserted: 1, deleted: 0 }]);

    expect(calls.some((c) => c.method === 'insert')).toBe(false);
    const updateCall = calls.find((c) => c.table === 'events' && c.method === 'update');
    expect(updateCall?.args[0]).toMatchObject({ external_id: 'e1', deleted_at: null });
    const updateEq = calls.find(
      (c) => c.table === 'events' && c.method === 'eq' && c.args[0] === 'id',
    );
    expect(updateEq?.args).toEqual(['id', 'ev1']);
  });

  it('端末側で消えた予定を論理削除する(時間窓内・応答に無い外部ID)', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    const nowIso = new Date().toISOString();
    responseQueue = [
      {
        data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }],
        error: null,
      },
      { data: [{ id: 'ev1', external_id: 'e1' }], error: null }, // 既存 external_id 検索(e1 既存)
      { error: null }, // update(e1)
      {
        data: [
          { external_id: 'e1', starts_at: nowIso, event_date: null }, // 今回も応答にある
          { external_id: 'gone', starts_at: nowIso, event_date: null }, // 応答に無い→削除対象
        ],
        error: null,
      }, // 削除差分用の既存 external_id
      { error: null }, // 削除 update
    ];
    listDeviceEventsInRange.mockResolvedValue([rawEvent({ id: 'e1', calendarId: 'cal-a' })]);
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.synced).toEqual([{ calendar: '仕事', upserted: 1, deleted: 1 }]);

    const deleteCall = calls.find(
      (c) =>
        c.table === 'events' &&
        c.method === 'in' &&
        Array.isArray(c.args[1]) &&
        (c.args[1] as string[]).includes('gone'),
    );
    expect(deleteCall?.args).toEqual(['external_id', ['gone']]);
  });

  it('終日予定の event_date はローカル日付として時間窓判定する(UTC 再解釈だと境界値を窓内と誤判定し得る)', async () => {
    // TZ=Asia/Tokyo(vite.config.ts)固定。"今" を JST 2026-06-15T05:00 に固定すると
    // windowMin(今-60日)は JST 2026-04-16T05:00。event_date='2026-04-16' の
    // ローカル深夜(JST 4/16 00:00)は windowMin より前 = 正しくは窓外。
    // もし Date.parse('2026-04-16')(UTC 深夜 = JST 4/16 09:00)で再解釈すると
    // windowMin より後 = 誤って窓内と判定され、消してはいけない古い予定を削除してしまう。
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T20:00:00.000Z')); // = JST 2026-06-15T05:00:00
    try {
      getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
      responseQueue = [
        {
          data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }],
          error: null,
        },
        {
          data: [{ external_id: 'boundary-event', starts_at: null, event_date: '2026-04-16' }],
          error: null,
        },
      ];
      listDeviceEventsInRange.mockResolvedValue([]);
      const { syncDeviceCalendarsNow } = await load();
      const r = await syncDeviceCalendarsNow();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.synced).toEqual([{ calendar: '仕事', upserted: 0, deleted: 0 }]);
      expect(calls.some((c) => c.table === 'events' && c.method === 'in')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('時間窓外の既存予定は削除差分の対象にしない', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    const farPastIso = new Date(Date.now() - 9_999 * 86_400_000).toISOString();
    responseQueue = [
      {
        data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }],
        error: null,
      },
      { data: [{ external_id: 'old', starts_at: farPastIso, event_date: null }], error: null }, // 既存(窓外)
    ];
    listDeviceEventsInRange.mockResolvedValue([]); // 今回は端末側に何も無い
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.synced).toEqual([{ calendar: '仕事', upserted: 0, deleted: 0 }]);
    expect(calls.some((c) => c.table === 'events' && c.method === 'in')).toBe(false);
  });

  it('削除差分用の既存イベント SELECT に安全マージンの limit を付ける', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [
      {
        data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }],
        error: null,
      },
      { data: [], error: null },
    ];
    listDeviceEventsInRange.mockResolvedValue([]);
    const { syncDeviceCalendarsNow } = await load();
    await syncDeviceCalendarsNow();
    const limitCall = calls.find((c) => c.table === 'events' && c.method === 'limit');
    expect(limitCall?.args).toEqual([2000]);
  });

  it('1カレンダーの失敗は他を止めない', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [
      {
        data: [
          { calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '失敗するカレンダー' },
          { calendar_id: 'cal-b-id', external_calendar_id: 'cal-b', summary: '成功するカレンダー' },
        ],
        error: null,
      },
      { error: { message: 'boom' } }, // cal-a の既存 external_id 検索が失敗
      { data: [], error: null }, // cal-b の既存 external_id 検索(該当なし)
      { error: null }, // cal-b の insert
      { data: [], error: null }, // cal-b の削除差分用の既存 external_id
    ];
    listDeviceEventsInRange.mockResolvedValue([
      rawEvent({ id: 'e1', calendarId: 'cal-a' }),
      rawEvent({ id: 'e2', calendarId: 'cal-b' }),
    ]);
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.errors).toEqual([{ calendar: '失敗するカレンダー', error: 'sync-failed' }]);
      expect(r.value.synced).toEqual([{ calendar: '成功するカレンダー', upserted: 1, deleted: 0 }]);
    }
  });

  it('端末側の一覧取得(listDeviceEventsInRange)自体が失敗したら sync/failed', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [
      { data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }], error: null },
    ];
    listDeviceEventsInRange.mockRejectedValue(new Error('permission revoked'));
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('sync/failed');
  });

  it('オフラインなら data/offline', async () => {
    getDeviceConnection.mockResolvedValue(ok({ id: 'conn1', provider: 'device', createdAt: 'x' }));
    responseQueue = [
      { data: [{ calendar_id: 'cal-a-id', external_calendar_id: 'cal-a', summary: '仕事' }], error: null },
    ];
    listDeviceEventsInRange.mockRejectedValue(new Error('Failed to fetch'));
    const { syncDeviceCalendarsNow } = await load();
    const r = await syncDeviceCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });

  it('実行中に再度呼ばれても新たな実行は起こさず、同じ Promise を共有する(フォアグラウンド復帰との二重発火対策)', async () => {
    let resolveConnection: (v: unknown) => void = () => {};
    getDeviceConnection.mockReturnValue(
      new Promise((resolve) => {
        resolveConnection = resolve;
      }),
    );
    const { syncDeviceCalendarsNow } = await load();
    const p1 = syncDeviceCalendarsNow();
    const p2 = syncDeviceCalendarsNow();
    expect(p1).toBe(p2);

    resolveConnection(ok(null));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ ok: true, value: { synced: [], errors: [] } });
    expect(r2).toBe(r1);
    expect(getDeviceConnection).toHaveBeenCalledTimes(1);

    // 完了後に呼べば新しい実行が起きる。
    getDeviceConnection.mockResolvedValue(ok(null));
    await syncDeviceCalendarsNow();
    expect(getDeviceConnection).toHaveBeenCalledTimes(2);
  });
});
