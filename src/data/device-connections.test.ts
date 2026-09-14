import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err, appError } from './result';

/**
 * device-connections.ts の検証。supabase(from チェーン)・platform/deviceCalendar
 * (権限要求)・data/connections(getDisconnectImpact)をモックする。
 * `device-calendars.test.ts` と同じ responseQueue パターン(`from()` が呼ばれるたびに
 * 先頭を1つ消費)。
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
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'insert', 'delete']) {
    chain[m] = record(m);
  }
  chain.maybeSingle = async () => {
    calls.push({ table, method: 'maybeSingle', args: [] });
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

const requestDeviceCalendarAccess = vi.fn();
vi.mock('@/platform/deviceCalendar', () => ({
  requestDeviceCalendarAccess: (...a: unknown[]) => requestDeviceCalendarAccess(...a),
}));

const getDisconnectImpact = vi.fn();
vi.mock('./connections', () => ({
  getDisconnectImpact: (...a: unknown[]) => getDisconnectImpact(...a),
}));

async function load() {
  return import('./device-connections');
}

beforeEach(() => {
  vi.resetModules();
  calls = [];
  responseQueue = [];
  from.mockClear();
  supabaseValue = { from };
  requestDeviceCalendarAccess.mockReset();
  getDisconnectImpact.mockReset();
});

describe('getDeviceConnection', () => {
  it('行があれば camelCase の DeviceConnection', async () => {
    responseQueue = [
      { data: { id: 'd1', provider: 'device', created_at: '2026-09-13T00:00:00Z' }, error: null },
    ];
    const { getDeviceConnection } = await load();
    const r = await getDeviceConnection();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        id: 'd1',
        provider: 'device',
        createdAt: '2026-09-13T00:00:00Z',
      });
    }
  });

  it('行が無ければ null', async () => {
    responseQueue = [{ data: null, error: null }];
    const { getDeviceConnection } = await load();
    const r = await getDeviceConnection();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('クエリエラーは data/query', async () => {
    responseQueue = [{ data: null, error: { message: 'x' } }];
    const { getDeviceConnection } = await load();
    const r = await getDeviceConnection();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

describe('connectDevice', () => {
  it('許可されたら connections(provider=device) を insert する', async () => {
    responseQueue = [{ data: null, error: null }, { error: null }];
    requestDeviceCalendarAccess.mockResolvedValue('granted');
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(true);
    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toEqual({ provider: 'device' });
  });

  it('拒否されたら connection/permission-denied を返し、insert は呼ばない', async () => {
    responseQueue = [{ data: null, error: null }];
    requestDeviceCalendarAccess.mockResolvedValue('denied');
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/permission-denied');
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('insert が失敗したら data/query', async () => {
    responseQueue = [{ data: null, error: null }, { error: { message: 'boom' } }];
    requestDeviceCalendarAccess.mockResolvedValue('granted');
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });

  it('権限要求が例外を投げたら connection/device-unavailable', async () => {
    responseQueue = [{ data: null, error: null }];
    requestDeviceCalendarAccess.mockRejectedValue(new Error('not implemented'));
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/device-unavailable');
  });

  it('権限要求そのものがオフラインで失敗したら data/offline', async () => {
    responseQueue = [{ data: null, error: null }];
    requestDeviceCalendarAccess.mockRejectedValue(new Error('Failed to fetch'));
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });

  it('既に有効な接続があれば権限要求も insert もせず成功扱い(二重発火対策)', async () => {
    responseQueue = [
      { data: { id: 'd1', provider: 'device', created_at: '2026-09-13T00:00:00Z' }, error: null },
    ];
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(true);
    expect(requestDeviceCalendarAccess).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
  });
});

describe('disconnectDevice', () => {
  it('calendars を明示削除 → connections を削除し、事前に数えた影響件数を返す', async () => {
    getDisconnectImpact.mockResolvedValue(ok({ events: 5, calendars: 2 }));
    responseQueue = [{ error: null }, { error: null }];
    const { disconnectDevice } = await load();
    const r = await disconnectDevice('conn1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ events: 5, calendars: 2 });

    const calDelete = calls.find((c) => c.table === 'calendars' && c.method === 'delete');
    expect(calDelete).toBeTruthy();
    const calEq = calls.find((c) => c.table === 'calendars' && c.method === 'eq');
    expect(calEq?.args).toEqual(['external_connection_id', 'conn1']);

    const connDelete = calls.find((c) => c.table === 'connections' && c.method === 'delete');
    expect(connDelete).toBeTruthy();
    const connEq = calls.find((c) => c.table === 'connections' && c.method === 'eq');
    expect(connEq?.args).toEqual(['id', 'conn1']);

    // calendars を先に、connections を後に削除する(FK cascade が無いため)。
    const calIdx = calls.findIndex((c) => c.table === 'calendars' && c.method === 'delete');
    const connIdx = calls.findIndex((c) => c.table === 'connections' && c.method === 'delete');
    expect(calIdx).toBeLessThan(connIdx);
  });

  it('影響件数の取得に失敗しても解除処理(削除)自体は続行する(件数は 0 扱い)', async () => {
    getDisconnectImpact.mockResolvedValue(err(appError('data/query', 'data/query')));
    responseQueue = [{ error: null }, { error: null }];
    const { disconnectDevice } = await load();
    const r = await disconnectDevice('conn1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ events: 0, calendars: 0 });
    expect(calls.some((c) => c.table === 'calendars' && c.method === 'delete')).toBe(true);
    expect(calls.some((c) => c.table === 'connections' && c.method === 'delete')).toBe(true);
  });

  it('calendars の削除が失敗したら connection/disconnect-failed、connections は削除しない', async () => {
    getDisconnectImpact.mockResolvedValue(ok({ events: 0, calendars: 0 }));
    responseQueue = [{ error: { message: 'boom' } }];
    const { disconnectDevice } = await load();
    const r = await disconnectDevice('conn1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/disconnect-failed');
    expect(calls.some((c) => c.table === 'connections' && c.method === 'delete')).toBe(false);
  });

  it('connections の削除が失敗したら connection/disconnect-failed', async () => {
    getDisconnectImpact.mockResolvedValue(ok({ events: 0, calendars: 0 }));
    responseQueue = [{ error: null }, { error: { message: 'boom' } }];
    const { disconnectDevice } = await load();
    const r = await disconnectDevice('conn1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/disconnect-failed');
  });
});
