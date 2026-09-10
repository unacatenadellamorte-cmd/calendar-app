import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * google-calendars.ts の検証。supabase(from チェーン / functions.invoke)をモック。
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
  return import('./google-calendars');
}

beforeEach(() => {
  vi.resetModules();
  queryResult = { data: null, error: null };
  invokeResult = { data: null, error: null };
  invoke.mockClear();
  from.mockClear();
  supabaseValue = { from, functions: { invoke } };
});

describe('listConnectionCalendars', () => {
  it('camelCase に変換して返す(sync_state なしは lastSyncedAt / lastError = null)', async () => {
    queryResult = {
      data: [
        { external_calendar_id: 'a@g', summary: '個人', background_color: '#4285F4', selected: true },
        { external_calendar_id: 'b@g', summary: '部活', background_color: null, selected: false },
      ],
      error: null,
    };
    const { listConnectionCalendars } = await load();
    const r = await listConnectionCalendars();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toMatchObject({
        externalCalendarId: 'a@g',
        summary: '個人',
        backgroundColor: '#4285F4',
        selected: true,
        lastSyncedAt: null,
        lastError: null,
      });
      expect(r.value[1]!.backgroundColor).toBeNull();
    }
  });

  it('sync_state をカレンダーごとにマージする', async () => {
    queryResult = {
      data: [
        {
          external_calendar_id: 'a@g',
          summary: '個人',
          background_color: null,
          selected: true,
          last_synced_at: '2026-09-10T12:00:00Z',
          last_error: null,
        },
      ],
      error: null,
    };
    const { listConnectionCalendars } = await load();
    const r = await listConnectionCalendars();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]!.lastSyncedAt).toBe('2026-09-10T12:00:00Z');
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'x' } };
    const { listConnectionCalendars } = await load();
    const r = await listConnectionCalendars();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

describe('refreshGoogleCalendars', () => {
  it('成功で count を返す', async () => {
    invokeResult = { data: { count: 3 }, error: null };
    const { refreshGoogleCalendars } = await load();
    const r = await refreshGoogleCalendars();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.count).toBe(3);
    expect(invoke).toHaveBeenCalledWith('google-calendars', { body: { action: 'refresh' } });
  });

  it('関数が reauth-needed を返したら connection/reauth-needed', async () => {
    invokeResult = {
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'reauth-needed' }), { status: 400 }) },
    };
    const { refreshGoogleCalendars } = await load();
    const r = await refreshGoogleCalendars();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/reauth-needed');
  });

  it('関数へ到達できない場合はオフライン扱い', async () => {
    invokeResult = { data: null, error: { name: 'FunctionsFetchError' } };
    const { refreshGoogleCalendars } = await load();
    const r = await refreshGoogleCalendars();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });
});

describe('setGoogleCalendarSelected', () => {
  it('action:set と externalCalendarId / selected を渡す', async () => {
    invokeResult = { data: { ok: true }, error: null };
    const { setGoogleCalendarSelected } = await load();
    const r = await setGoogleCalendarSelected('a@g', true);
    expect(r.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith('google-calendars', {
      body: { action: 'set', externalCalendarId: 'a@g', selected: true },
    });
  });

  it('不明な slug は calendars-failed に丸める', async () => {
    invokeResult = {
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'weird' }), { status: 500 }) },
    };
    const { setGoogleCalendarSelected } = await load();
    const r = await setGoogleCalendarSelected('a@g', false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/calendars-failed');
  });
});
