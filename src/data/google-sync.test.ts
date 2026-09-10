import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * google-sync.ts の検証。supabase(from チェーン / functions.invoke)をモック。
 */

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };
const invoke = vi.fn(async () => invokeResult);

function makeChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'returns']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
  return chain;
}
const from = vi.fn(() => makeChain());
let supabaseValue: unknown = { from, functions: { invoke } };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

async function load() {
  return import('./google-sync');
}

beforeEach(() => {
  vi.resetModules();
  queryResult = { data: null, error: null };
  invokeResult = { data: null, error: null };
  invoke.mockClear();
  from.mockClear();
  supabaseValue = { from, functions: { invoke } };
});

describe('syncGoogleCalendarsNow', () => {
  it('scheduled:false を渡し、synced / errors を返す', async () => {
    invokeResult = { data: { synced: [{ calendar: 'ゴミ', upserted: 3, deleted: 1 }], errors: [] }, error: null };
    const { syncGoogleCalendarsNow } = await load();
    const r = await syncGoogleCalendarsNow();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.synced[0]).toEqual({ calendar: 'ゴミ', upserted: 3, deleted: 1 });
    expect(invoke).toHaveBeenCalledWith('sync-calendars', { body: { scheduled: false } });
  });

  it('関数が reauth-needed を返したら connection/reauth-needed', async () => {
    invokeResult = {
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'reauth-needed' }), { status: 400 }) },
    };
    const { syncGoogleCalendarsNow } = await load();
    const r = await syncGoogleCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/reauth-needed');
  });

  it('not-connected は connection/not-connected', async () => {
    invokeResult = {
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'not-connected' }), { status: 409 }) },
    };
    const { syncGoogleCalendarsNow } = await load();
    const r = await syncGoogleCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/not-connected');
  });

  it('不明な slug は sync/failed に丸める', async () => {
    invokeResult = {
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'weird' }), { status: 500 }) },
    };
    const { syncGoogleCalendarsNow } = await load();
    const r = await syncGoogleCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('sync/failed');
  });

  it('関数へ到達できない場合はオフライン扱い', async () => {
    invokeResult = { data: null, error: { name: 'FunctionsFetchError' } };
    const { syncGoogleCalendarsNow } = await load();
    const r = await syncGoogleCalendarsNow();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });
});

describe('listSyncState', () => {
  it('camelCase に変換して返す', async () => {
    queryResult = {
      data: [
        {
          calendar_id: 'c1',
          external_calendar_id: 'a@g',
          last_synced_at: '2026-09-10T12:00:00Z',
          last_error: null,
        },
        {
          calendar_id: null,
          external_calendar_id: 'b@g',
          last_synced_at: null,
          last_error: 'reauth-needed',
        },
      ],
      error: null,
    };
    const { listSyncState } = await load();
    const r = await listSyncState();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toEqual({
        calendarId: 'c1',
        externalCalendarId: 'a@g',
        lastSyncedAt: '2026-09-10T12:00:00Z',
        lastError: null,
      });
      expect(r.value[1]!.lastError).toBe('reauth-needed');
    }
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'x' } };
    const { listSyncState } = await load();
    const r = await listSyncState();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});
