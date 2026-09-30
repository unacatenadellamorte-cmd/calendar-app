import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Denoの入口を捕まえ、実際の関数ソースをネットワーク・DBなしで実行する。
const root = resolve(process.cwd(), 'supabase/functions');
const source = (path: string) => transpileModule(readFileSync(resolve(root, path), 'utf8'), {
  compilerOptions: { module: ModuleKind.CommonJS },
}).outputText;
const scopes = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly';
const rpc = vi.fn();
const fetchMock = vi.fn();
let handler: (request: Request) => Promise<Response>;
let tokenBody: Record<string, unknown>;
let userError: unknown;
let userId: string;
let anonymous: boolean;

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url.includes('/token')) return Response.json(tokenBody);
    return Response.json({ items: [{ primary: true, id: 'review@example.test' }] });
  });
  tokenBody = { access_token: 'access', refresh_token: 'refresh', scope: scopes };
  userError = null;
  userId = 'user-a';
  anonymous = false;
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://database.example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-key',
    GOOGLE_OAUTH_CLIENT_ID: 'web-client', GOOGLE_OAUTH_CLIENT_SECRET: 'server-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example.test/connections/google/callback',
    APP_ORIGIN: 'https://app.example.test', APP_ORIGINS: 'https://localhost,capacitor://localhost',
  };
  const deno = { env: { get: (name: string) => env[name] }, serve: (callback: typeof handler) => { handler = callback; } };
  const corsExports = {};
  runInNewContext(source('_shared/cors.ts'), { exports: corsExports, Deno: deno, Response });
  runInNewContext(source('oauth-exchange/index.ts'), {
    exports: {}, Deno: deno, Response, URLSearchParams, fetch: fetchMock,
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    require: (name: string) => name.includes('supabase-js') ? {
      createClient: () => ({ auth: { getUser: async () => ({
        data: { user: { id: userId, is_anonymous: anonymous } }, error: userError,
      }) }, rpc }),
    } : corsExports,
  });
});

function request(body: Record<string, unknown>, origin = 'https://localhost') {
  return new Request('https://edge.example.test/oauth-exchange', {
    method: 'POST', headers: { Authorization: 'Bearer jwt-a', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe.each(['android', 'ios'])('oauth-exchangeの%s/Web境界', (platform) => {
  const androidBody = { platform, expectedUserId: 'user-a', code: 'native-code' };
  it('Androidコードは空のredirect_uriで交換し本人のVault保存だけを呼ぶ', async () => {
    const response = await handler(request(androidBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ googleEmail: 'review@example.test' });
    const sent = fetchMock.mock.calls[0]![1].body as URLSearchParams;
    expect(sent.get('redirect_uri')).toBe('');
    expect(sent.get('client_id')).toBe('web-client');
    expect(rpc).toHaveBeenCalledWith('upsert_google_connection', {
      p_user_id: 'user-a', p_refresh_token: 'refresh', p_google_email: 'review@example.test',
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  });

  it('Webの既存redirect_uriを維持する', async () => {
    const response = await handler(request({ code: 'web-code', redirectUri: 'http://localhost:5173/connections/google/callback' }));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1].body.get('redirect_uri')).toBe('http://localhost:5173/connections/google/callback');
  });

  it.each([
    { ...androidBody, expectedUserId: 'user-b' },
    { ...androidBody, expectedUserId: undefined },
    { ...androidBody, redirectUri: 'https://localhost' },
    { ...androidBody, platform: 'unknown' },
    { ...androidBody, code: '' },
  ])('不正なフロー・利用者・コードでは交換も保存もしない', async (body) => {
    expect((await handler(request(body))).status).toBeGreaterThanOrEqual(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, '', scopes.split(' ')[0]])('スコープが不足したら保存しない', async (scope) => {
    tokenBody.scope = scope;
    expect((await handler(request(androidBody))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('認証失効を拒否する', async () => {
    userError = { message: 'expired' };
    expect((await handler(request(androidBody))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('匿名利用者のAndroid連携を拒否する', async () => {
    anonymous = true;
    expect((await handler(request(androidBody))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('トークン取得の通信失敗を保存しない', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect((await handler(request(androidBody))).status).toBe(502);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([401, 403, 503])('Androidのカレンダー一覧確認失敗では接続を保存しない: %s', async (status) => {
    fetchMock.mockImplementation(async (url: string) => url.includes('/token')
      ? Response.json(tokenBody) : Response.json({ error: 'failed' }, { status }));
    expect((await handler(request(androidBody))).status).toBe(502);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('アカウント削除競合などで保存RPCが拒否したら成功を返さない', async () => {
    rpc.mockResolvedValue({ error: { message: 'user does not exist' } });
    expect((await handler(request(androidBody))).status).toBe(500);
  });

  it('長期トークンがなければ保存しない', async () => {
    delete tokenBody.refresh_token;
    expect((await handler(request(androidBody))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['https://localhost', 'capacitor://localhost', 'https://app.example.test', 'https://untrusted.example.test'])('CORSは明示したオリジンのみ返す: %s', async (origin) => {
    const response = await handler(new Request('https://edge.example.test', { method: 'OPTIONS', headers: { Origin: origin } }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin.includes('untrusted') ? null : origin);
  });
});
