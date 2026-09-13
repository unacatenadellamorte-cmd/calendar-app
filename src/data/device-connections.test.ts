import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * device-connections.ts の検証。supabase(from チェーン)と platform/deviceCalendar
 * (権限要求)をモックする。
 */

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let insertResult: { error: unknown } = { error: null };
const insert = vi.fn(async (..._args: unknown[]) => insertResult);

function makeChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) chain[m] = () => chain;
  chain.maybeSingle = async () => queryResult;
  chain.insert = (...a: unknown[]) => insert(...a);
  return chain;
}
const from = vi.fn(() => makeChain());
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

async function load() {
  return import('./device-connections');
}

beforeEach(() => {
  vi.resetModules();
  queryResult = { data: null, error: null };
  insertResult = { error: null };
  insert.mockClear();
  from.mockClear();
  supabaseValue = { from };
  requestDeviceCalendarAccess.mockReset();
});

describe('getDeviceConnection', () => {
  it('行があれば camelCase の DeviceConnection', async () => {
    queryResult = {
      data: { id: 'd1', provider: 'device', created_at: '2026-09-13T00:00:00Z' },
      error: null,
    };
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
    const { getDeviceConnection } = await load();
    const r = await getDeviceConnection();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'x' } };
    const { getDeviceConnection } = await load();
    const r = await getDeviceConnection();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

describe('connectDevice', () => {
  it('許可されたら connections(provider=device) を insert する', async () => {
    requestDeviceCalendarAccess.mockResolvedValue('granted');
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith({ provider: 'device' });
  });

  it('拒否されたら connection/permission-denied を返し、insert は呼ばない', async () => {
    requestDeviceCalendarAccess.mockResolvedValue('denied');
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/permission-denied');
    expect(insert).not.toHaveBeenCalled();
  });

  it('insert が失敗したら data/query', async () => {
    requestDeviceCalendarAccess.mockResolvedValue('granted');
    insertResult = { error: { message: 'boom' } };
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });

  it('権限要求が例外を投げたら connection/device-unavailable', async () => {
    requestDeviceCalendarAccess.mockRejectedValue(new Error('not implemented'));
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/device-unavailable');
  });

  it('権限要求そのものがオフラインで失敗したら data/offline', async () => {
    requestDeviceCalendarAccess.mockRejectedValue(new Error('Failed to fetch'));
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });

  it('既に有効な接続があれば権限要求も insert もせず成功扱い(二重発火対策)', async () => {
    queryResult = {
      data: { id: 'd1', provider: 'device', created_at: '2026-09-13T00:00:00Z' },
      error: null,
    };
    const { connectDevice } = await load();
    const r = await connectDevice();
    expect(r.ok).toBe(true);
    expect(requestDeviceCalendarAccess).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
