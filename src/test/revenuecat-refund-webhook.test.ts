// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { expect, it, vi } from 'vitest';
import * as core from '../../packages/core/src/revenuecat-webhook';

const user = '10000000-0000-4000-8000-000000000001';
const eventAt = Date.parse('2026-10-15T00:00:00Z');
const body = {
  event: {
    type: 'CANCELLATION',
    app_user_id: user,
    cancel_reason: 'CUSTOMER_SUPPORT',
    event_timestamp_ms: eventAt,
    expiration_at_ms: eventAt + 86400000,
    entitlement_ids: ['calendar_write'],
  },
};
async function invoke(
  options: {
    apiKey?: string;
    status?: number;
    subscriber?: unknown;
    authorization?: string;
    rpcError?: boolean;
  } = {},
) {
  let handler!: (request: Request) => Promise<Response>;
  const env: Record<string, string> = {
    REVENUECAT_WEBHOOK_AUTH: 'synthetic-webhook-auth',
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key',
  };
  if (options.apiKey !== '')
    env.REVENUECAT_SECRET_API_KEY = options.apiKey ?? 'synthetic-secret-api-key';
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: true, error: options.rpcError ? { code: '40001' } : null });
  const http = vi
    .fn()
    .mockImplementation(async () =>
      Response.json(options.subscriber ?? { subscriber: { entitlements: {} } }, {
        status: options.status ?? 200,
      }),
    );
  const source = transpileModule(
    readFileSync('supabase/functions/revenuecat-webhook/index.ts', 'utf8'),
    { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(source, {
    exports: {},
    Deno: {
      env: { get: (key: string) => env[key] },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    Response,
    AbortSignal,
    fetch: http,
    console: { log: vi.fn(), error: vi.fn() },
    require: (path: string) =>
      path.includes('supabase-js') ? { createClient: () => ({ rpc }) } : core,
  });
  const response = await handler(
    new Request('https://example.invalid/revenuecat-webhook', {
      method: 'POST',
      headers: { Authorization: options.authorization ?? 'synthetic-webhook-auth' },
      body: JSON.stringify(body),
    }),
  );
  return { response, rpc, http };
}

it('返金通知を認証し、公開SDKキーでなくサーバーキーで現在状態を照合する', async () => {
  const result = await invoke({
    subscriber: {
      subscriber: {
        entitlements: {
          calendar_write: {
            expires_date: '2026-11-15T00:00:00Z',
            grace_period_expires_date: null,
            product_identifier: 'monthly',
          },
        },
      },
    },
  });
  expect(result.response.status).toBe(200);
  expect(result.http.mock.calls[0]?.[0]).toBe(
    `https://api.revenuecat.com/v1/subscribers/${user}`,
  );
  expect(result.http.mock.calls[0]?.[1].headers.Authorization).toBe(
    'Bearer synthetic-secret-api-key',
  );
  expect(result.rpc).toHaveBeenCalledWith(
    'apply_revenuecat_entitlement',
    expect.objectContaining({
      p_user_id: user,
      p_entitlement: 'calendar_write',
      p_expires_at: '2026-11-15T00:00:00.000Z',
    }),
  );
});
it('API上で権利が消えていれば期限を通知時刻へ戻す', async () => {
  const { response, rpc } = await invoke();
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc.mock.calls.map((call) => call[1].p_entitlement).sort()).toEqual([
    'calendar_write',
    'device_photos',
    'multi_account',
  ]);
  expect(
    rpc.mock.calls.every((call) => call[1].p_expires_at === '2026-10-15T00:00:00.000Z'),
  ).toBe(true);
});
it.each([{ apiKey: '' }, { status: 503 }, { subscriber: { subscriber: {} } }])(
  '設定不足・外部障害・不正応答を成功扱いせず再送させる: %j',
  async (options) => {
    const { response, rpc } = await invoke(options);
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it('未認証では外部APIも権利更新も呼ばない', async () => {
  const { response, rpc, http } = await invoke({ authorization: 'synthetic-invalid' });
  expect(response.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
});
it('DB失敗を200にせず、権利反映の再送を要求する', async () => {
  const { response } = await invoke({ rpcError: true });
  expect(response.status).toBe(500);
});
