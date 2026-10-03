import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * connections.ts の検証。supabase(functions.invoke / from チェーン)と env をモックする。
 * Docker 未導入で Supabase ローカルが起動できないため。
 */

const authorizeGoogle = vi.fn();
let android = false;
vi.mock('@/platform/googleAuthorization', () => ({
  authorizeGoogle: (...args: unknown[]) => authorizeGoogle(...args),
  isAndroidGoogleAuthorization: () => android,
}));

const STATE_KEY = 'calendar-app.google-oauth-state';

let queryResult: { data: unknown; error: unknown; count?: number } = { data: null, error: null };
let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const invoke = vi.fn(async () => invokeResult);
const rpc = vi.fn(async () => rpcResult);

let eqCalls: unknown[][] = [];
let orderCalls: unknown[][] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'limit', 'returns']) {
    chain[m] = () => chain;
  }
  chain.order = (...args: unknown[]) => {
    orderCalls.push(args);
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    eqCalls.push(args);
    return chain;
  };
  chain.maybeSingle = async () => queryResult;
  // .is() 等で終端して await するクエリ用(getDisconnectImpact)。
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
  return chain;
}
const from = vi.fn(() => makeChain());

let supabaseValue: unknown = { from, functions: { invoke }, rpc };
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
  android = false;
  authorizeGoogle.mockReset();
  queryResult = { data: null, error: null };
  invokeResult = { data: null, error: null };
  rpcResult = { data: null, error: null };
  eqCalls = [];
  orderCalls = [];
  invoke.mockClear();
  rpc.mockClear();
  from.mockClear();
  supabaseValue = { from, functions: { invoke }, rpc };
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
    const r = await startGoogleConnect();
    expect(r && r.ok === false && r.error.messageKey).toBe('connection/unavailable');
    expect(assign).not.toHaveBeenCalled();
  });

  it('state を sessionStorage に置き、同意画面 URL へ遷移する', async () => {
    const { startGoogleConnect } = await load();
    await startGoogleConnect();
    const state = sessionStorage.getItem(STATE_KEY);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('state')).toBe(state);
    // 複数接続対応: 2つ目のアカウントを選べるよう、毎回アカウント選択を出す
    expect(url.searchParams.get('prompt')).toBe('consent select_account');
    expect(url.searchParams.getAll('prompt')).toHaveLength(1);
    expect(url.searchParams.get('redirect_uri')).toContain('/connections/google/callback');
    // refresh_token を得るための既存パラメータは保つ
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('withAccountChooser', () => {
  it('prompt を consent select_account に置き換え、他のパラメータは変えない', async () => {
    const { withAccountChooser } = await load();
    const out = new URL(
      withAccountChooser('https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&state=s&scope=a+b'),
    );
    expect(out.searchParams.getAll('prompt')).toEqual(['consent select_account']);
    expect(out.searchParams.get('state')).toBe('s');
    expect(out.searchParams.get('scope')).toBe('a b');
  });

  it('prompt が無い URL にも付ける', async () => {
    const { withAccountChooser } = await load();
    const out = new URL(withAccountChooser('https://accounts.google.com/o/oauth2/v2/auth?state=s'));
    expect(out.searchParams.get('prompt')).toBe('consent select_account');
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

  it('接続上限の 403 {error:"connection/limit-reached"} は connection/limit-reached', async () => {
    sessionStorage.setItem(STATE_KEY, 's');
    invokeResult = {
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'connection/limit-reached' }), { status: 403 }),
      },
    };
    const { completeGoogleConnect } = await load();
    const r = await completeGoogleConnect(new URLSearchParams({ code: 'c', state: 's' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/limit-reached');
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

  it('provider=google を明示フィルタする(device 接続に惑わされない、Story 5.2)', async () => {
    const { getConnection } = await load();
    await getConnection();
    expect(eqCalls).toContainEqual(['provider', 'google']);
  });
});

describe('listConnections', () => {
  it('全接続を camelCase + status 付きで作成順に返す', async () => {
    queryResult = {
      data: [
        { id: 'c1', provider: 'google', google_email: 'a@gmail.com', created_at: '2026-09-10T00:00:00Z', status: 'active' },
        { id: 'c2', provider: 'google', google_email: null, created_at: '2026-10-01T00:00:00Z', status: 'suspended' },
      ],
      error: null,
    };
    const { listConnections } = await load();
    const r = await listConnections();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([
        { id: 'c1', provider: 'google', googleEmail: 'a@gmail.com', createdAt: '2026-09-10T00:00:00Z', status: 'active', writeGranted: false },
        { id: 'c2', provider: 'google', googleEmail: null, createdAt: '2026-10-01T00:00:00Z', status: 'suspended', writeGranted: false },
      ]);
    }
    expect(eqCalls).toContainEqual(['provider', 'google']);
    expect(orderCalls).toContainEqual(['created_at', { ascending: true }]);
  });

  it('行が無ければ空配列', async () => {
    queryResult = { data: null, error: null };
    const { listConnections } = await load();
    const r = await listConnections();
    expect(r).toEqual({ ok: true, value: [] });
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'nope' } };
    const { listConnections } = await load();
    const r = await listConnections();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

describe('getDisconnectImpact', () => {
  it('events / calendars の件数を返す', async () => {
    queryResult = { data: null, error: null, count: 252 };
    const { getDisconnectImpact } = await load();
    const r = await getDisconnectImpact('conn1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ events: 252, calendars: 252 });
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'x' } };
    const { getDisconnectImpact } = await load();
    const r = await getDisconnectImpact('conn1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

describe('disconnectGoogle', () => {
  it('RPC の返り値(消えた件数)を返す。複数接続対応で connectionId を渡す', async () => {
    rpcResult = { data: { deleted: true, events: 252, calendars: 1 }, error: null };
    const { disconnectGoogle } = await load();
    const r = await disconnectGoogle('conn-id-123');
    expect(rpc).toHaveBeenCalledWith('disconnect_google_connection', { p_connection_id: 'conn-id-123' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ events: 252, calendars: 1 });
  });

  it('接続が無くても冪等に成功(deleted:false)', async () => {
    rpcResult = { data: { deleted: false, events: 0, calendars: 0 }, error: null };
    const { disconnectGoogle } = await load();
    const r = await disconnectGoogle('conn-id-123');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ events: 0, calendars: 0 });
  });

  it('RPC エラーは connection/disconnect-failed', async () => {
    rpcResult = { data: null, error: { message: 'boom' } };
    const { disconnectGoogle } = await load();
    const r = await disconnectGoogle('conn-id-123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('connection/disconnect-failed');
  });

  it('ネットワーク障害はオフライン扱い', async () => {
    rpcResult = { data: null, error: { message: 'Failed to fetch' } };
    const { disconnectGoogle } = await load();
    const r = await disconnectGoogle('conn-id-123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });
});


describe('AndroidのGoogle認可', () => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ];
  let session: { user: { id: string; is_anonymous: boolean }; access_token: string } | null;
  let authChanged: (_event: string, value: typeof session) => void;
  const unsubscribe = vi.fn();
  beforeEach(() => {
    android = true;
    session = { user: { id: 'user-a', is_anonymous: false }, access_token: 'jwt-a' };
    supabaseValue = {
      from, functions: { invoke }, rpc,
      auth: {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
        onAuthStateChange: vi.fn((callback) => {
          authChanged = callback;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
    };
    unsubscribe.mockClear();
    invokeResult = { data: { googleEmail: 'me@gmail.com' }, error: null };
    authorizeGoogle.mockResolvedValue({ code: 'native-code', grantedScopes: scopes });
  });

  it('開始時のJWTと利用者IDで交換し、ブラウザへ遷移しない', async () => {
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toEqual({ ok: true, value: { googleEmail: 'me@gmail.com' } });
    expect(invoke).toHaveBeenCalledWith('oauth-exchange', {
      body: { code: 'native-code', platform: 'android', expectedUserId: 'user-a' },
      headers: { Authorization: 'Bearer jwt-a' },
    });
    expect(assign).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('接続上限の 403 は connection/limit-reached(Android でも同じ文言へ)', async () => {
    invokeResult = {
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'connection/limit-reached' }), { status: 403 }),
      },
    };
    const { startGoogleConnect } = await load();
    const r = await startGoogleConnect();
    expect(r && !r.ok && r.error.messageKey).toBe('connection/limit-reached');
  });

  it.each([
    { code: '', grantedScopes: scopes },
    { code: 'native-code', grantedScopes: scopes.slice(0, 1) },
  ])('コードなし・権限不足では保存しない', async (value) => {
    authorizeGoogle.mockResolvedValue(value);
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toMatchObject({ ok: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('同一利用者のJWT更新後は交換直前の新しいJWTで認可コードを送る', async () => {
    authorizeGoogle.mockImplementation(async () => {
      session = { user: { id: 'user-a', is_anonymous: false }, access_token: 'jwt-refreshed' };
      authChanged('TOKEN_REFRESHED', session);
      return { code: 'native-code', grantedScopes: scopes };
    });
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toMatchObject({ ok: true });
    expect(invoke).toHaveBeenCalledWith('oauth-exchange', {
      body: { code: 'native-code', platform: 'android', expectedUserId: 'user-a' },
      headers: { Authorization: 'Bearer jwt-refreshed' },
    });
  });

  it('取消の後に再試行できる', async () => {
    authorizeGoogle.mockRejectedValueOnce({ code: 'cancelled' });
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toMatchObject({ ok: false, error: { messageKey: 'connection/cancelled' } });
    expect(await startGoogleConnect()).toMatchObject({ ok: true });
  });

  it('認可中の連打を拒否し、利用者変更では交換しない', async () => {
    let finish!: (value: unknown) => void;
    authorizeGoogle.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { startGoogleConnect } = await load();
    const first = startGoogleConnect();
    await vi.waitFor(() => expect(authorizeGoogle).toHaveBeenCalledOnce());
    expect(await startGoogleConnect()).toMatchObject({ ok: false });
    session = { user: { id: 'user-b', is_anonymous: false }, access_token: 'jwt-b' };
    authChanged('SIGNED_IN', session);
    finish({ code: 'native-code', grantedScopes: scopes });
    expect(await first).toMatchObject({ ok: false, error: { messageKey: 'connection/not-authenticated' } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('ログアウトして同じ利用者へ戻っても認可を無効化する', async () => {
    authorizeGoogle.mockImplementation(async () => {
      authChanged('SIGNED_OUT', null);
      authChanged('SIGNED_IN', session);
      return { code: 'native-code', grantedScopes: scopes };
    });
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toMatchObject({ ok: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'FunctionsFetchError', message: 'Failed to send' },
    { context: new Response(JSON.stringify({ error: 'not-authenticated' }), { status: 401 }) },
  ])('通信失敗・認証失効を成功扱いしない', async (error) => {
    invokeResult = { data: null, error };
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toMatchObject({ ok: false });
  });

  it('匿名・セッションなしでは認可を開始しない', async () => {
    session = null;
    const { startGoogleConnect } = await load();
    expect(await startGoogleConnect()).toMatchObject({ ok: false });
    expect(authorizeGoogle).not.toHaveBeenCalled();
  });
});
