import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * device-calendars.ts の検証。supabase(from チェーン)と platform/deviceCalendar
 * (端末の一覧取得)をモックする。
 *
 * 各操作は `supabase.from(table)` を1回だけ呼んで完結する(以後のメソッドチェーンは
 * 同じビルダーを返すだけ)ため、`responseQueue` に呼び出し順で応答を積んでおけば
 * `from()` が呼ばれるたびに先頭を1つ消費するだけで再現できる。
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
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in', 'returns', 'insert', 'update', 'upsert']) {
    chain[m] = record(m);
  }
  chain.maybeSingle = async () => {
    calls.push({ table, method: 'maybeSingle', args: [] });
    return response;
  };
  chain.single = async () => {
    calls.push({ table, method: 'single', args: [] });
    return response;
  };
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return chain;
}

const from = vi.fn((table: string) => makeBuilder(table));
let supabaseValue: unknown = { from };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

const listNativeCalendars = vi.fn();
vi.mock('@/platform/deviceCalendar', () => ({
  listDeviceCalendars: (...a: unknown[]) => listNativeCalendars(...a),
}));

async function load() {
  return import('./device-calendars');
}

beforeEach(() => {
  vi.resetModules();
  calls = [];
  responseQueue = [];
  from.mockClear();
  supabaseValue = { from };
  listNativeCalendars.mockReset();
});

describe('listDeviceCalendars', () => {
  it('camelCase に変換して返す', async () => {
    responseQueue = [
      {
        data: [
          { external_calendar_id: 'a', summary: '仕事', background_color: '#FF0000', selected: true },
        ],
        error: null,
      },
    ];
    const { listDeviceCalendars } = await load();
    const r = await listDeviceCalendars('conn1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([
        { externalCalendarId: 'a', summary: '仕事', backgroundColor: '#FF0000', selected: true },
      ]);
    }
  });

  it('クエリエラーは data/query', async () => {
    responseQueue = [{ data: null, error: { message: 'x' } }];
    const { listDeviceCalendars } = await load();
    const r = await listDeviceCalendars('conn1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

describe('refreshDeviceCalendarCatalog', () => {
  it('端末の一覧を upsert する(タイトル null→空文字、8桁カラーは6桁に正規化)', async () => {
    listNativeCalendars.mockResolvedValue([
      { id: 'a', title: '仕事', color: '#FF0000FF' },
      { id: 'b', title: null, color: null },
    ]);
    responseQueue = [
      { error: null }, // upsert
      { data: [], error: null }, // active rows(何も消えていない)
    ];
    const { refreshDeviceCalendarCatalog } = await load();
    const r = await refreshDeviceCalendarCatalog('conn1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.count).toBe(2);

    const upsertCall = calls.find((c) => c.method === 'upsert');
    expect(upsertCall?.args[0]).toEqual([
      {
        connection_id: 'conn1',
        external_calendar_id: 'a',
        summary: '仕事',
        background_color: '#FF0000',
        deleted_at: null,
      },
      {
        connection_id: 'conn1',
        external_calendar_id: 'b',
        summary: '',
        background_color: null,
        deleted_at: null,
      },
    ]);
  });

  it('6桁にも8桁にもマッチしない色は DEFAULT_COLOR にフォールバックする', async () => {
    listNativeCalendars.mockResolvedValue([{ id: 'a', title: '仕事', color: 'rgb(1,2,3)' }]);
    responseQueue = [{ error: null }, { data: [], error: null }];
    const { refreshDeviceCalendarCatalog, DEFAULT_COLOR } = await load();
    const r = await refreshDeviceCalendarCatalog('conn1');
    expect(r.ok).toBe(true);

    const upsertCall = calls.find((c) => c.method === 'upsert');
    expect((upsertCall?.args[0] as Array<{ background_color: string | null }>)[0]?.background_color).toBe(
      DEFAULT_COLOR,
    );
  });

  it('応答に無くなった候補をカタログから外し、紐づく calendars 行も論理削除する', async () => {
    listNativeCalendars.mockResolvedValue([{ id: 'a', title: '仕事', color: null }]);
    responseQueue = [
      { error: null }, // upsert
      {
        data: [
          { id: 'cc-a', external_calendar_id: 'a', calendar_id: null },
          { id: 'cc-b', external_calendar_id: 'b', calendar_id: 'cal-b' },
        ],
        error: null,
      }, // active rows
      { error: null }, // connection_calendars 論理削除
      { error: null }, // calendars 論理削除
    ];
    const { refreshDeviceCalendarCatalog } = await load();
    const r = await refreshDeviceCalendarCatalog('conn1');
    expect(r.ok).toBe(true);

    const ccDeactivate = calls.find((c) => c.table === 'connection_calendars' && c.method === 'in');
    expect(ccDeactivate?.args).toEqual(['id', ['cc-b']]);
    const ccUpdate = calls.find((c) => c.table === 'connection_calendars' && c.method === 'update');
    expect(ccUpdate?.args[0]).toMatchObject({ selected: false });
    expect((ccUpdate?.args[0] as { deleted_at: string }).deleted_at).toEqual(expect.any(String));

    const calDeactivate = calls.find((c) => c.table === 'calendars' && c.method === 'in');
    expect(calDeactivate?.args).toEqual(['id', ['cal-b']]);
    const calUpdate = calls.find((c) => c.table === 'calendars' && c.method === 'update');
    expect((calUpdate?.args[0] as { deleted_at: string }).deleted_at).toEqual(expect.any(String));
  });

  it('端末の一覧が空でも既存の選択済みカタログが無ければ何もせず成功する', async () => {
    listNativeCalendars.mockResolvedValue([]);
    responseQueue = [{ data: null, error: null }]; // 既存カタログ無し
    const { refreshDeviceCalendarCatalog } = await load();
    const r = await refreshDeviceCalendarCatalog('conn1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.count).toBe(0);
    expect(calls.some((c) => c.method === 'upsert' || c.method === 'update')).toBe(false);
  });

  it('端末の一覧が空で既存の選択済みカタログがあれば、消さずにエラーを返す(iOS権限取消対策)', async () => {
    listNativeCalendars.mockResolvedValue([]);
    responseQueue = [{ data: { id: 'cc-a' }, error: null }]; // 既存カタログあり
    const { refreshDeviceCalendarCatalog } = await load();
    const r = await refreshDeviceCalendarCatalog('conn1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/device-unavailable');
    // upsert も論理削除も一切走らない。
    expect(calls.some((c) => c.method === 'upsert' || c.method === 'update')).toBe(false);
  });

  it('端末側の一覧取得が失敗したら connection/device-unavailable', async () => {
    listNativeCalendars.mockRejectedValue(new Error('boom'));
    const { refreshDeviceCalendarCatalog } = await load();
    const r = await refreshDeviceCalendarCatalog('conn1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/device-unavailable');
  });
});

describe('setDeviceCalendarSelected', () => {
  it('オン(新規): calendars を insert(source=device)し、connection_calendars を更新する', async () => {
    responseQueue = [
      { data: { id: 'cc1', summary: '仕事', background_color: '#FF0000', calendar_id: null }, error: null },
      { data: { id: 'cal1' }, error: null },
      { error: null },
    ];
    const { setDeviceCalendarSelected } = await load();
    const r = await setDeviceCalendarSelected('conn1', 'a', true);
    expect(r.ok).toBe(true);

    const insertCall = calls.find((c) => c.table === 'calendars' && c.method === 'insert');
    expect(insertCall?.args[0]).toMatchObject({
      name: '仕事',
      color: '#FF0000',
      source: 'device',
      external_connection_id: 'conn1',
      external_calendar_id: 'a',
    });
  });

  it('オン(復活): 既存 calendars 行を最下位優先度で復活させる', async () => {
    responseQueue = [
      { data: { id: 'cc1', summary: '仕事', background_color: null, calendar_id: 'cal1' }, error: null },
      { data: { priority: 4 }, error: null },
      { error: null },
      { error: null },
    ];
    const { setDeviceCalendarSelected } = await load();
    const r = await setDeviceCalendarSelected('conn1', 'a', true);
    expect(r.ok).toBe(true);

    const reviveCall = calls.find(
      (c) =>
        c.table === 'calendars' &&
        c.method === 'update' &&
        typeof c.args[0] === 'object' &&
        c.args[0] !== null &&
        'priority' in (c.args[0] as Record<string, unknown>),
    );
    expect(reviveCall?.args[0]).toMatchObject({
      deleted_at: null,
      name: '仕事',
      color: '#7A7A7A',
      priority: 5,
    });
  });

  it('オフ: calendars 行を論理削除し、connection_calendars.selected を false にする', async () => {
    responseQueue = [
      { data: { id: 'cc1', summary: '仕事', background_color: null, calendar_id: 'cal1' }, error: null },
      { error: null },
      { error: null },
    ];
    const { setDeviceCalendarSelected } = await load();
    const r = await setDeviceCalendarSelected('conn1', 'a', false);
    expect(r.ok).toBe(true);

    const deleteCall = calls.find((c) => c.table === 'calendars' && c.method === 'update');
    expect(deleteCall?.args[0]).toHaveProperty('deleted_at');
    const ccUpdate = calls.find((c) => c.table === 'connection_calendars' && c.method === 'update');
    expect(ccUpdate?.args[0]).toEqual({ selected: false });
  });

  it('カタログに候補が無ければ connection/calendar-not-found', async () => {
    responseQueue = [{ data: null, error: null }];
    const { setDeviceCalendarSelected } = await load();
    const r = await setDeviceCalendarSelected('conn1', 'x', true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/calendar-not-found');
  });

  it('オン: 端末側のタイトルが長すぎる/空でも calendars.name の制約内に正規化する', async () => {
    const longTitle = 'あ'.repeat(150);
    responseQueue = [
      { data: { id: 'cc1', summary: longTitle, background_color: null, calendar_id: null }, error: null },
      { data: { id: 'cal1' }, error: null },
      { error: null },
    ];
    const { setDeviceCalendarSelected } = await load();
    const r = await setDeviceCalendarSelected('conn1', 'a', true);
    expect(r.ok).toBe(true);
    const insertCall = calls.find((c) => c.table === 'calendars' && c.method === 'insert');
    const name = (insertCall?.args[0] as { name: string }).name;
    expect(name.length).toBeLessThanOrEqual(100);
  });

  it('オン: 端末側のタイトルが空白のみなら DEFAULT_NAME にフォールバックする', async () => {
    responseQueue = [
      { data: { id: 'cc1', summary: '   ', background_color: null, calendar_id: null }, error: null },
      { data: { id: 'cal1' }, error: null },
      { error: null },
    ];
    const { setDeviceCalendarSelected, DEFAULT_NAME } = await load();
    const r = await setDeviceCalendarSelected('conn1', 'a', true);
    expect(r.ok).toBe(true);
    const insertCall = calls.find((c) => c.table === 'calendars' && c.method === 'insert');
    expect((insertCall?.args[0] as { name: string }).name).toBe(DEFAULT_NAME);
  });
});
