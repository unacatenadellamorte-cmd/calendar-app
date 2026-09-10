/**
 * Google OAuth の純ロジック(ARCHITECTURE-SPINE AD-3 / Epic 3)。
 * このモジュールは何も import しない。クライアント(認可 URL 構築)と
 * Edge Function(トークン応答パース)が同じ規則を使うために置く。
 *
 * 秘匿情報(client_secret / refresh_token)はここでは扱わない。
 * client_secret での交換は Edge Function のみ(AD-3)。
 */

/** 要求するスコープ。カレンダー読み取りの最小限。書き込みスコープは含めない(§8.3)。 */
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface GoogleAuthUrlParams {
  clientId: string;
  redirectUri: string;
  /** CSRF 対策の不透明トークン。呼び出し側が乱数生成し、コールバックで照合する。 */
  state: string;
  /** 省略時は GOOGLE_CALENDAR_SCOPES。 */
  scopes?: readonly string[];
}

/**
 * 同意画面へのリダイレクト先 URL を組み立てる。
 * `access_type=offline` + `prompt=consent` で毎回 refresh_token を受け取る。
 */
export function buildGoogleAuthUrl(params: GoogleAuthUrlParams): string {
  const scopes = params.scopes ?? GOOGLE_CALENDAR_SCOPES;
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: params.state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${query.toString()}`;
}

/** parseGoogleTokenResponse の結果。成功時のみトークンを持つ。 */
export type GoogleTokenParse =
  | { ok: true; refreshToken: string; accessToken: string; expiresInSec: number }
  | { ok: false; reason: 'no-refresh-token' | 'exchange-failed' };

/**
 * `https://oauth2.googleapis.com/token` の JSON 応答を判定する。
 * - `error` を含む / `access_token` が無い → 'exchange-failed'
 * - `refresh_token` が無い(再認可で consent が省略された等)→ 'no-refresh-token'
 *   (呼び出し側は「接続をやり直してください」を出す)
 */
export function parseGoogleTokenResponse(json: unknown): GoogleTokenParse {
  if (typeof json !== 'object' || json === null) {
    return { ok: false, reason: 'exchange-failed' };
  }
  const body = json as Record<string, unknown>;
  if (typeof body.error === 'string' || typeof body.access_token !== 'string') {
    return { ok: false, reason: 'exchange-failed' };
  }
  if (typeof body.refresh_token !== 'string' || body.refresh_token.length === 0) {
    return { ok: false, reason: 'no-refresh-token' };
  }
  return {
    ok: true,
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresInSec: typeof body.expires_in === 'number' ? body.expires_in : 0,
  };
}

/**
 * calendarList(`GET /calendar/v3/users/me/calendarList`)の応答から
 * primary カレンダーの id(= Google アカウントのメールアドレス)を取り出す。
 * 見つからなければ null(表示は「Google カレンダー」にフォールバック)。
 */
export function primaryEmailFromCalendarList(json: unknown): string | null {
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
