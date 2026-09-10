// Edge Function 共通の CORS ヘッダ。
// 許可オリジンは APP_ORIGIN(関数シークレット)。単一オリジンのみ許可する。
//
// ⚠️ フォールバックの `http://localhost:5173` は**ローカル開発専用**。
//    localhost 以外へ SPA をデプロイする前に、必ず全 Edge Function
//    (oauth-exchange / google-calendars / sync-calendars)の関数シークレット
//    `APP_ORIGIN` を実オリジン(例 https://calendar.example.com)に設定すること。
//    未設定のままだと本番からのリクエストが CORS で全部弾かれる。
//    設定手順: docs/google-connection-setup.md / Epic 3 retro F4。

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:5173';

/**
 * リクエストごとの CORS ヘッダ。
 * `Access-Control-Allow-Headers` はブラウザのプリフライトが要求したヘッダをそのまま反映する
 * (supabase-js が送るヘッダ集合はバージョンで変わるため、固定リストにしない)。
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const requested = req.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': requested ?? 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}

/** OPTIONS プリフライトなら 204 を返す。それ以外は null。 */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  }
  return null;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}
