import { buildGoogleAuthUrl } from '@core';
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

/** コールバックのルートパス。Google Cloud の「承認済みリダイレクト URI」と一致させる。 */
export const GOOGLE_CALLBACK_PATH = '/connections/google/callback';

export interface Connection {
  id: string;
  provider: 'google';
  /** 表示用の Google アカウントメール。取得できなかった場合は null。 */
  googleEmail: string | null;
  createdAt: string;
}

interface ConnectionRow {
  id: string;
  provider: 'google';
  google_email: string | null;
  created_at: string;
}

const UNAVAILABLE = appError('connection/unavailable', 'connection/unavailable');
const COLUMNS = 'id,provider,google_email,created_at';

function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    provider: row.provider,
    googleEmail: row.google_email,
    createdAt: row.created_at,
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
 * 同意画面へリダイレクトする。state を乱数生成して sessionStorage に保持し、
 * コールバックで照合する。呼び出し後はページ遷移するため返らない。
 */
export function startGoogleConnect(): Result<never> | void {
  if (!env.googleOauthClientId) return err(UNAVAILABLE);
  const state = randomState();
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    // sessionStorage 不可でも state 照合以外は成立する。ただし CSRF 保護が効かないので中止。
    return err(appError('connection/state-mismatch', 'connection/state-mismatch'));
  }
  const url = buildGoogleAuthUrl({
    clientId: env.googleOauthClientId,
    redirectUri: googleRedirectUri(),
    state,
  });
  window.location.assign(url);
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
  const returnedState = params.get('state');
  const storedState = safeReadState();
  safeClearState();

  if (!code || !returnedState || !storedState || returnedState !== storedState) {
    return err(appError('connection/state-mismatch', 'connection/state-mismatch'));
  }

  const result = await invokeFn<{ googleEmail: string | null } | null>(
    'oauth-exchange',
    { code, redirectUri: googleRedirectUri() },
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
 */
export async function disconnectGoogle(): Promise<Result<DisconnectImpact>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await supabase.rpc('disconnect_google_connection');
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
