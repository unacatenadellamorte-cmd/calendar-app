import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * connections.ts の検証。supabase(functions.invoke / from チェーン)と env をモックする。
 * Docker 未導入で Supabase ローカルが起動できないため。
 */

const STATE_KEY = 'calendar-app.google-oauth-state';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };
const invoke = vi.fn(async () => invokeResult);

function makeChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = async () => queryResult;
  return chain;
}
const from = vi.fn(() => makeChain());

let supabaseValue: unknown = { from, functions: { invoke } };
interface FakeEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  hasSupabase: boolean;
  googleOauthClientId: string | undefined;
  hasGoogleOauth: boolean;
}
let envValue: FakeEnv = {
  supabaseUrl: 'http://x',
  supabaseAnonKey: 'k',
  hasSupabase: true,
  googleOauthClientId: 'cid.apps.googleusercontent.com',
  hasGoogleOauth: true,
};

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));

async function load() {
  return import('./connections');
}

const assign = vi.fn();
const origLocation = window.location;

beforeEach(() => {
  assign.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { origin: 'http://localhost:5173', href: 'http://localhost:5173/settings', assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: origLocation,
  });
});

beforeEach(() => {
  vi.resetModules();
  queryResult = { data: null, error: null };
  invokeResult = { data: null, error: null };
  invoke.mockClear();
  from.mockClear();
  supabaseValue = { from, functions: { invoke } };
  envValue = {
    supabaseUrl: 'http://x',
    supabaseAnonKey: 'k',
    hasSupabase: true,
    googleOauthClientId: 'cid.apps.googleusercontent.com',
    hasGoogleOauth: true,
  };
  sessionStorage.clear();
});

describe('startGoogleConnect', () => {
  it('client ID 未設定なら connection/unavailable を返し、遷移しない', async () => {
    envValue.googleOauthClientId = undefined;
    const { startGoogleConnect } = await load();
    const r = startGoogleConnect();
    expect(r && r.ok === false && r.error.messageKey).toBe('connection/unavailable');
    expect(assign).not.toHaveBeenCalled();
  });

  it('state を sessionStorage に置き、同意画面 URL へ遷移する', async () => {
    const { startGoogleConnect } = await load();
    startGoogleConnect();
    const state = sessionStorage.getItem(STATE_KEY);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toContain('/connections/google/callback');
  });
});

describe('completeGoogleConnect', () => {
  it('state 不一致なら関数を呼ばず state-mismatch', async () => {
    sessionStorage.setItem(STATE_KEY, 'expected');
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ code: 'c', state: 'other' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/state-mismatch');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('?error=access_denied は cancelled(関数を呼ばない)', async () => {
    sessionStorage.setItem(STATE_KEY, 's');
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ error: 'access_denied', state: 's' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/cancelled');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('正常: 関数を呼び googleEmail を返す。state は消える', async () => {
    sessionStorage.setItem(STATE_KEY, 's');
    invokeResult = { data: { googleEmail: 'me@gmail.com' }, error: null };
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ code: 'c', state: 's' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.googleEmail).toBe('me@gmail.com');
    expect(invoke).toHaveBeenCalledWith('oauth-exchange', {
      body: { code: 'c', redirectUri: expect.stringContaining('/connections/google/callback') },
    });
    expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('関数がエラー本文 {error:"no-refresh-token"} を返したら connection/no-refresh-token', async () => {
    sessionStorage.setItem(STATE_KEY, 's');
    invokeResult = {
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'no-refresh-token' }), { status: 400 }) },
    };
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ code: 'c', state: 's' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/no-refresh-token');
  });

  it('本文が読めないエラーは汎用 exchange-failed', async () => {
    sessionStorage.setItem(STATE_KEY, 's');
    invokeResult = { data: null, error: { message: 'boom' } };
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ code: 'c', state: 's' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/exchange-failed');
  });

  it('関数へ到達できない(FunctionsFetchError)はオフライン扱い', async () => {
    sessionStorage.setItem(STATE_KEY, 's');
    invokeResult = { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send' } };
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ code: 'c', state: 's' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });
});

describe('getConnection', () => {
  it('行があれば camelCase の Connection', async () => {
    queryResult = {
      data: {
        id: 'conn1',
        provider: 'google',
        google_email: 'me@gmail.com',
        created_at: '2026-09-10T00:00:00Z',
      },
      error: null,
    };
    const { getConnection } = await load();
    const r = await getConnection();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({
      id: 'conn1',
      provider: 'google',
      googleEmail: 'me@gmail.com',
      createdAt: '2026-09-10T00:00:00Z',
    });
  });

  it('行が無ければ null', async () => {
    queryResult = { data: null, error: null };
    const { getConnection } = await load();
    const r = await getConnection();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'nope' } };
    const { getConnection } = await load();
    const r = await getConnection();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});
