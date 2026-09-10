import { buildGoogleAuthUrl } from '@core';
import { supabase } from './supabase';
import { env } from './env';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';

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

  try {
    const { data, error } = await supabase.functions.invoke<{ googleEmail: string | null }>(
      'oauth-exchange',
      { body: { code, redirectUri: googleRedirectUri() } },
    );
    if (error) {
      // supabase-js は非2xx/ネットワーク失敗を throw せず error として返す。
      // FunctionsFetchError(関数へ到達できない)はオフライン扱い。
      const name = (error as { name?: string }).name;
      if (name === 'FunctionsFetchError' || isNetworkError(error)) {
        return err(appError('data/offline', 'data/offline', error));
      }
      // FunctionsHttpError は context(Response)本文に { error: messageKey } を持つ。
      const key = await extractFunctionErrorKey(error);
      return err(appError(key, key, error));
    }
    return ok({ googleEmail: data?.googleEmail ?? null });
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('connection/exchange-failed', 'connection/exchange-failed', e));
  }
}

/** 自分の有効な Google 接続を1件返す(無ければ null)。 */
export async function getConnection(): Promise<Result<Connection | null>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await supabase
      .from('connections')
      .select(COLUMNS)
      .is('deleted_at', null)
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

const KNOWN_CONNECTION_KEYS = new Set([
  'connection/exchange-failed',
  'connection/no-refresh-token',
  'connection/cancelled',
  'connection/state-mismatch',
  'connection/not-authenticated',
]);

/** Edge Function のエラー応答本文から messageKey を取り出す(取れなければ汎用)。 */
async function extractFunctionErrorKey(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      const raw = typeof body?.error === 'string' ? body.error : '';
      if (raw === 'not-authenticated') return 'connection/not-authenticated';
      if (KNOWN_CONNECTION_KEYS.has(`connection/${raw}`)) return `connection/${raw}`;
      if (KNOWN_CONNECTION_KEYS.has(raw)) return raw;
    } catch {
      // フォールスルー
    }
  }
  return 'connection/exchange-failed';
}
