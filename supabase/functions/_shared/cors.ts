// Edge Function 共通の CORS ヘッダ。
// 許可オリジンは APP_ORIGIN(関数シークレット)。未設定ならローカル開発の 5173。
// 本番ホスティングを用意したら APP_ORIGIN をそのURLに設定する。

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
