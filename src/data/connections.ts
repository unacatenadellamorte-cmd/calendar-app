import { buildGoogleAuthUrl, GOOGLE_CALENDAR_SCOPES } from '@core';
import { authorizeGoogle, nativeGoogleAuthorizationPlatform } from '@/platform/googleAuthorization';
import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { env } from './env';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { invokeFn } from './edge';

/**
 * Google 接続の data-access レイヤ(Story 3.1、ARCHITECTURE-SPINE AD-3 / AD-9)。
 * すべて Result を返す(throw しない)。snake↔camel 変換はここだけ。
 *
 * このレイヤは refresh_token / access_token を一切扱わない。
 * 認可コードの交換と Google API 呼び出しは oauth-exchange Edge Function のみ。
 */

/** CSRF 対策の state を置く sessionStorage キー。 */
const STATE_KEY = 'calendar-app.google-oauth-state';
const WRITE_KEY = 'calendar-app.google-oauth-write';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** コールバックのルートパス。Google Cloud の「承認済みリダイレクト URI」と一致させる。 */
export const GOOGLE_CALLBACK_PATH = '/connections/google/callback';

export interface Connection {
  id: string;
  provider: 'google';
  /** 表示用の Google アカウントメール。取得できなかった場合は null。 */
  googleEmail: string | null;
  createdAt: string;
}

export interface GoogleConnectionInfo extends Connection {
  writeGranted?: boolean;
  /** 接続の状態: 'active' または 'suspended'。 */
  status: 'active' | 'suspended';
}

interface ConnectionRow {
  id: string;
  provider: 'google';
  google_email: string | null;
  created_at: string;
}

interface GoogleConnectionInfoRow extends ConnectionRow {
  write_granted?: boolean;
  status: 'active' | 'suspended';
}

const UNAVAILABLE = appError('connection/unavailable', 'connection/unavailable');
const COLUMNS = 'id,provider,google_email,created_at';
const COLUMNS_WITH_STATUS = 'id,provider,google_email,created_at,status,write_granted';

function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    provider: row.provider,
    googleEmail: row.google_email,
    createdAt: row.created_at,
  };
}

function toGoogleConnectionInfo(row: GoogleConnectionInfoRow): GoogleConnectionInfo {
  return {
    id: row.id,
    provider: row.provider,
    googleEmail: row.google_email,
    createdAt: row.created_at,
    status: row.status,
    writeGranted: row.write_granted === true,
  };
}

/** 現在のリダイレクト URI(オリジン + コールバックパス)。 */
export function googleRedirectUri(): string {
  return `${window.location.origin}${GOOGLE_CALLBACK_PATH}`;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Webはstate付き同意画面へ遷移し、Android/iOSはSDKから取得したコードを交換する。
 * ネイティブの成功結果だけがUIの接続状態再取得を開始する。
 * Webでは複数接続対応のため prompt に select_account を加える。
 */
let connecting = false;

export async function startGoogleConnect(options?: { writeConnectionId: string }): Promise<Result<{ googleEmail: string | null }> | void> {
  if (connecting) return err(appError('connection/exchange-failed', 'connection/exchange-failed'));
  const platform = nativeGoogleAuthorizationPlatform();
  if (platform) return connectNativeGoogle(platform, options?.writeConnectionId);
  if (!env.googleOauthClientId) return err(UNAVAILABLE);
  const state = randomState();
  try {
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.removeItem(WRITE_KEY);
    if (options) {
      const current = await supabase?.auth.getSession();
      const user = current?.data.session?.user;
      if (!user || user.is_anonymous) return err(appError('connection/not-authenticated', 'connection/not-authenticated'));
      sessionStorage.setItem(WRITE_KEY, JSON.stringify({ connectionId: options.writeConnectionId, userId: user.id }));
    }
  } catch {
    // sessionStorage 不可でも state 照合以外は成立する。ただし CSRF 保護が効かないので中止。
    return err(appError('connection/state-mismatch', 'connection/state-mismatch'));
  }
  window.location.assign(
    withAccountChooser(
      buildGoogleAuthUrl({
        clientId: env.googleOauthClientId,
        redirectUri: googleRedirectUri(),
        state,
        ...(options ? { scopes: [GOOGLE_CALENDAR_SCOPES[0], WRITE_SCOPE] } : {}),
      }),
    ),
  );
}

/**
 * 認可 URL の `prompt` を `consent select_account` にする(複数アカウント対応、CAP-3)。
 * ブラウザが既に1つの Google アカウントでログイン済みでも、毎回アカウント選択画面を
 * 出して2つ目のアカウントを選べるようにする。`consent` は refresh_token を確実に
 * 得るために残す。core の buildGoogleAuthUrl は変更せず、ここで URL として上書きする。
 */
export function withAccountChooser(authUrl: string): string {
  const url = new URL(authUrl);
  url.searchParams.set('prompt', 'consent select_account');
  return url.toString();
}


/** 認可開始時の利用者を固定し、交換直前の同一利用者のJWTを明示して使う。 */
async function connectNativeGoogle(platform: 'android' | 'ios', writeConnectionId?: string): Promise<Result<{ googleEmail: string | null }>> {
  if (!supabase || !env.googleOauthClientId) return err(UNAVAILABLE);
  connecting = true;
  let unsubscribe: (() => void) | undefined;
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data.session;
    if (error || !session || session.user.is_anonymous) {
      return err(appError('connection/not-authenticated', 'connection/not-authenticated'));
    }
    let changed = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => {
      if (!current || current.user.is_anonymous || current.user.id !== session.user.id) changed = true;
    });
    unsubscribe = () => listener.subscription.unsubscribe();
    const authorization = writeConnectionId ? await authorizeGoogle(env.googleOauthClientId, true) : await authorizeGoogle(env.googleOauthClientId);
    const current = await supabase.auth.getSession();
    const exchangeSession = current.data.session;
    if (changed || current.error || !exchangeSession || exchangeSession.user.is_anonymous || exchangeSession.user.id !== session.user.id) {
      return err(appError('connection/not-authenticated', 'connection/not-authenticated'));
    }
    const scopes = writeConnectionId ? [GOOGLE_CALENDAR_SCOPES[0], WRITE_SCOPE] : GOOGLE_CALENDAR_SCOPES;
    if (!authorization.code || !scopes.every((scope) => authorization.grantedScopes?.includes(scope) || (scope === GOOGLE_CALENDAR_SCOPES[1] && authorization.grantedScopes?.includes(WRITE_SCOPE)))) {
      return err(appError('connection/exchange-failed', 'connection/exchange-failed'));
    }
    const result = await invokeFn<{ googleEmail: string | null } | null>(
      'oauth-exchange',
      { code: authorization.code, platform, expectedUserId: session.user.id,
        ...(writeConnectionId ? { writeConnectionId } : {}) },
      slugToConnectionKey,
      'connection/exchange-failed',
      exchangeSession.access_token,
    );
    if (changed) return err(appError('connection/not-authenticated', 'connection/not-authenticated'));
    if (!result.ok) return result;
    if (!result.value || !('googleEmail' in result.value)) {
      return err(appError('connection/exchange-failed', 'connection/exchange-failed'));
    }
    return ok({ googleEmail: result.value.googleEmail });
  } catch (error) {
    const key = (error as { code?: string })?.code === 'cancelled'
      ? 'connection/cancelled' : isNetworkError(error) ? 'data/offline' : 'connection/exchange-failed';
    return err(appError(key, key));
  } finally {
    unsubscribe?.();
    connecting = false;
  }
}

/**
 * コールバックで受け取ったパラメータを処理する。
 * - `error` パラメータ(ユーザー拒否等)→ 対応するエラー
 * - `state` 不一致 → connection/state-mismatch(関数は呼ばない)
 * - それ以外 → oauth-exchange を呼ぶ。成功で `{ googleEmail }`。
 */
export async function completeGoogleConnect(params: URLSearchParams): Promise<
  Result<{ googleEmail: string | null }>
> {
  if (!supabase) return err(UNAVAILABLE);

  const oauthError = params.get('error');
  if (oauthError) {
    const stored = safeReadState();
    if (stored !== null) safeClearState();
    return err(
      appError(
        oauthError === 'access_denied' ? 'connection/cancelled' : 'connection/exchange-failed',
        oauthError === 'access_denied' ? 'connection/cancelled' : 'connection/exchange-failed',
      ),
    );
  }

  const code = params.get('code');
  let write: { connectionId: string; userId: string } | null = null;
  try { write = JSON.parse(sessionStorage.getItem(WRITE_KEY) ?? 'null'); sessionStorage.removeItem(WRITE_KEY); }
  catch { return err(appError('connection/state-mismatch', 'connection/state-mismatch')); }
  const returnedState = params.get('state');
  const storedState = safeReadState();
  safeClearState();

  if (!code || !returnedState || !storedState || returnedState !== storedState) {
    return err(appError('connection/state-mismatch', 'connection/state-mismatch'));
  }

  const result = await invokeFn<{ googleEmail: string | null } | null>(
    'oauth-exchange',
    { code, redirectUri: googleRedirectUri(), ...(write ? { writeConnectionId: write.connectionId, expectedUserId: write.userId } : {}) },
    slugToConnectionKey,
    'connection/exchange-failed',
  );
  if (!result.ok) return result;
  return ok({ googleEmail: result.value?.googleEmail ?? null });
}

/** oauth-exchange の error slug をアプリの messageKey へ。 */
function slugToConnectionKey(slug: string): string {
  if (slug === 'not-authenticated') return 'connection/not-authenticated';
  if (slug === 'no-refresh-token') return 'connection/no-refresh-token';
  if (slug === 'cancelled') return 'connection/cancelled';
  if (slug === 'connection/limit-reached') return 'connection/limit-reached';
  if (slug === 'connection/ambiguous') return 'connection/ambiguous';
  return 'connection/exchange-failed';
}

/** 接続解除で消えるものの件数(確認シートのプレビュー用、Story 3.4)。 */
export interface DisconnectImpact {
  events: number;
  calendars: number;
}

/**
 * 接続解除で消える予定・カレンダーの件数を数える(実削除の前に見せる)。
 * 取得できなくても解除自体は続行できるため、失敗は呼び出し側で握りつぶしてよい。
 */
export async function getDisconnectImpact(
  connectionId: string,
): Promise<Result<DisconnectImpact>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const [events, calendars] = await Promise.all([
      selectActive('events', '*', { count: 'exact', head: true }).eq(
        'connection_id',
        connectionId,
      ),
      selectActive('calendars', '*', { count: 'exact', head: true }).eq(
        'external_connection_id',
        connectionId,
      ),
    ]);
    if (events.error) return err(appError('data/query', 'data/query', events.error));
    if (calendars.error) return err(appError('data/query', 'data/query', calendars.error));
    return ok({ events: events.count ?? 0, calendars: calendars.count ?? 0 });
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/**
 * Google 接続を解除する(Story 3.4)。`disconnect_google_connection` RPC が
 * 取り込んだ予定・カレンダー行・接続・Vault secret を実削除する。冪等。
 * 返り値は実際に消えた件数。
 * 複数接続対応: connectionId を p_connection_id として渡す。
 */
export async function disconnectGoogle(connectionId: string): Promise<Result<DisconnectImpact>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await supabase.rpc('disconnect_google_connection', { p_connection_id: connectionId });
    if (error) {
      if (isNetworkError(error)) return err(appError('data/offline', 'data/offline', error));
      return err(appError('connection/disconnect-failed', 'connection/disconnect-failed', error));
    }
    const row = (data ?? {}) as { events?: number; calendars?: number };
    return ok({ events: row.events ?? 0, calendars: row.calendars ?? 0 });
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('connection/disconnect-failed', 'connection/disconnect-failed', e));
  }
}

/**
 * 自分の有効な Google 接続を1件返す(無ければ null)。
 * `provider='google'` を明示フィルタする ── device 接続(Story 5.2)と混在しても
 * 惑わされない。
 */
export async function getConnection(): Promise<Result<Connection | null>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await selectActive('connections', COLUMNS)
      .eq('provider', 'google')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ConnectionRow>();
    if (error) return err(appError('data/query', 'data/query', error));
    return ok(data ? toConnection(data) : null);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/**
 * 自分のすべての Google 接続を一覧で返す(active と suspended を含む)。
 * 作成順(昇順)で返す。
 */
export async function listConnections(): Promise<Result<GoogleConnectionInfo[]>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await selectActive('connections', COLUMNS_WITH_STATUS)
      .eq('provider', 'google')
      .order('created_at', { ascending: true })
      .returns<GoogleConnectionInfoRow[]>();
    if (error) return err(appError('data/query', 'data/query', error));
    return ok((data ?? []).map(toGoogleConnectionInfo));
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

function safeReadState(): string | null {
  try {
    return sessionStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
}

function safeClearState(): void {
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    // no-op
  }
}
