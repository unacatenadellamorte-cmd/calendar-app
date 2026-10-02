// oauth-exchange — Google OAuth 認可コードをトークンに交換し、refresh_token を
// Supabase Vault に保管して connections 行を作る(Story 3.1、ARCHITECTURE-SPINE AD-3)。
//
// この関数だけが client_secret を持ち、Google のトークンエンドポイントを叩く。
// refresh_token / access_token はレスポンスに含めない。
//
// 必要な関数シークレット(Supabase ダッシュボード → Edge Functions → Secrets):
//   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI
//   APP_ORIGIN / APP_ORIGINS: WebとAndroidの明示許可オリジン。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は実行時に自動注入される。

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor, handlePreflight, jsonResponse } from '../_shared/cors.ts';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_LIST_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner&maxResults=250';

// --- packages/core/src/google-oauth.ts と同じ規則。変更時は両方を直す。---
// (ローカルに Deno が無く import マップを検証できないため、Story 3.1 では複製する。
//  Story 3.3 で Deno 環境が整えば @calendar-app/core の import に寄せる。)
type TokenParse =
  | { ok: true; refreshToken: string; accessToken: string }
  | { ok: false; reason: 'no-refresh-token' | 'exchange-failed' };

function parseGoogleTokenResponse(json: unknown): TokenParse {
  if (typeof json !== 'object' || json === null) return { ok: false, reason: 'exchange-failed' };
  const body = json as Record<string, unknown>;
  if (typeof body.error === 'string' || typeof body.access_token !== 'string') {
    return { ok: false, reason: 'exchange-failed' };
  }
  if (typeof body.refresh_token !== 'string' || body.refresh_token.length === 0) {
    return { ok: false, reason: 'no-refresh-token' };
  }
  return { ok: true, refreshToken: body.refresh_token, accessToken: body.access_token };
}

function primaryEmailFromCalendarList(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const items = (json as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (
      typeof item === 'object' &&
      item !== null &&
      (item as Record<string, unknown>).primary === true &&
      typeof (item as Record<string, unknown>).id === 'string'
    ) {
      return (item as Record<string, unknown>).id as string;
    }
  }
  return null;
}
// --- 複製ここまで ---

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'method-not-allowed' }, 405);
  }

  const started = Date.now();

  // 1) 呼び出し元のユーザーを特定(Supabase JWT)。
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('oauth-exchange: missing SUPABASE_URL / SERVICE_ROLE_KEY');
    return jsonResponse(req, { error: 'exchange-failed' }, 500);
  }

  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(req, { error: 'not-authenticated' }, 401);
  }
  const userId = userData.user.id;

  // 2) リクエスト本文。
  let code: string | undefined;
  let redirectUri: string | undefined;
  let platform: unknown;
  let expectedUserId: unknown;
  try {
    const body = await req.json();
    platform = body?.platform;
    expectedUserId = body?.expectedUserId;
    code = typeof body?.code === 'string' ? body.code : undefined;
    redirectUri = typeof body?.redirectUri === 'string' ? body.redirectUri : undefined;
  } catch {
    // フォールスルー
  }
  if (platform !== undefined && platform !== 'android' && platform !== 'web') {
    return jsonResponse(req, { error: 'exchange-failed' }, 400);
  }
  const android = platform === 'android';
  if (android && (expectedUserId !== userId || userData.user.is_anonymous)) {
    return jsonResponse(req, { error: 'not-authenticated' }, 401);
  }
  if (!code) return jsonResponse(req, { error: 'exchange-failed' }, 400);

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  const configuredRedirect = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');
  if (!clientId || !clientSecret) {
    console.error('oauth-exchange: missing GOOGLE_OAUTH_CLIENT_ID / _SECRET');
    return jsonResponse(req, { error: 'exchange-failed' }, 500);
  }
  // Webは既存のリダイレクト先を維持する。Androidのサーバー用コードは空文字で交換する。
  const effectiveRedirect = android ? '' : redirectUri ?? configuredRedirect ?? '';
  if (android && redirectUri !== undefined) {
    return jsonResponse(req, { error: 'exchange-failed' }, 400);
  }

  // 3) 認可コード → トークン交換。
  let tokenJson: unknown = null;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: effectiveRedirect,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return jsonResponse(req, { error: 'exchange-failed' }, 400);
    tokenJson = await tokenRes.json().catch(() => null);
  } catch (e) {
    console.warn('oauth-exchange: token endpoint unreachable', (e as Error)?.message);
    return jsonResponse(req, { error: 'exchange-failed' }, 502);
  }
  const parsed = parseGoogleTokenResponse(tokenJson);
  if (!parsed.ok) {
    console.warn(`oauth-exchange: token exchange failed (${parsed.reason})`);
    return jsonResponse(req, { error: parsed.reason }, 400);
  }

  // Androidはコード交換で返されたスコープをサーバーでも確認する。
  if (android) {
    const scope = (tokenJson as Record<string, unknown>).scope;
    const granted = typeof scope === 'string' ? scope.split(/\s+/) : [];
    if (![
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ].every((required) => granted.includes(required))) {
      return jsonResponse(req, { error: 'exchange-failed' }, 400);
    }
  }

  // 4) 表示用に primary カレンダーのメールを取得(ベストエフォート)。
  let googleEmail: string | null = null;
  try {
    const listRes = await fetch(GOOGLE_CALENDAR_LIST_ENDPOINT, {
      headers: { Authorization: `Bearer ${parsed.accessToken}` },
    });
    if (listRes.ok) {
      googleEmail = primaryEmailFromCalendarList(await listRes.json());
    } else if (android) {
      return jsonResponse(req, { error: 'exchange-failed' }, 502);
    }
  } catch {
    if (android) return jsonResponse(req, { error: 'exchange-failed' }, 502);
    // Webの既存フローではメール取得はベストエフォート。
  }

  // 5) refresh_token を Vault へ、connections を upsert(service_role)。
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: rpcError } = await adminClient.rpc('upsert_google_connection', {
    p_user_id: userId,
    p_refresh_token: parsed.refreshToken,
    p_google_email: googleEmail,
  });
  if (rpcError) {
    // 接続上限に達した場合は 403 で返す。
    if (rpcError.message.includes('connection_limit_reached')) {
      console.warn('oauth-exchange: connection limit reached', userId);
      return jsonResponse(req, { error: 'connection/limit-reached' }, 403);
    }
    console.error('oauth-exchange: upsert_google_connection failed', rpcError.message);
    return jsonResponse(req, { error: 'exchange-failed' }, 500);
  }

  const emailDomain = googleEmail?.split('@')[1] ?? 'unknown';
  console.log(
    `oauth-exchange: ok user=${userId} emailDomain=${emailDomain} elapsedMs=${Date.now() - started}`,
  );

  // トークンは返さない。表示用の情報だけ。
  return new Response(JSON.stringify({ googleEmail }), {
    status: 200,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  try {
    return await handle(req);
  } catch (e) {
    // 想定外の例外でも CORS ヘッダ付きで返す(ブラウザに素の CORS エラーを見せない)。
    console.error('oauth-exchange: unhandled', (e as Error)?.message);
    return jsonResponse(req, { error: 'exchange-failed' }, 500);
  }
});
