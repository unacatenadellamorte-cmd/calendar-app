import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type Result } from './result';
import { normalizeAuthError } from './auth.errors';

/**
 * 認証は Supabase Auth に委ねる。この層は supabase.auth を薄くラップし、
 * すべて Result を返す(throw しない)。UI・hooks はここを通す(AD-9)。
 *
 * お試しモード = 匿名サインイン。匿名ユーザーも実 auth.uid() を持つので、
 * 後続の RLS(user_id = auth.uid())がそのまま効く。
 * `upgradeToPassword` で同じ uid のままメールアカウントへ昇格する。
 */

const UNAVAILABLE = appError('auth/unavailable', 'auth/unavailable');

/** メール形式に見えるか(緩い判定。厳密な検証は Supabase 側)。 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Supabase が使えるか。false なら AuthState は 'unavailable'。 */
export function isAuthAvailable(): boolean {
  return supabase !== null;
}

export async function getSession(): Promise<Result<Session | null>> {
  if (!supabase) return err(UNAVAILABLE);
  const { data, error } = await supabase.auth.getSession();
  if (error) return err(normalizeAuthError(error));
  return ok(data.session);
}

export async function signInAnonymously(): Promise<Result<Session | null>> {
  if (!supabase) return err(UNAVAILABLE);
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return err(normalizeAuthError(error));
  return ok(data.session);
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<Result<Session | null>> {
  if (!supabase) return err(UNAVAILABLE);
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return err(normalizeAuthError(error));
  return ok(data.session);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<Result<Session>> {
  if (!supabase) return err(UNAVAILABLE);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return err(normalizeAuthError(error));
  return ok(data.session);
}

/** 匿名セッションから同じ uid のままメールアカウントへ昇格する。 */
export async function upgradeToPassword(
  email: string,
  password: string,
): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
  if (error) return err(normalizeAuthError(error));
  return ok(undefined);
}

export async function signOut(): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  const { error } = await supabase.auth.signOut();
  if (error) return err(normalizeAuthError(error));
  return ok(undefined);
}

/**
 * 認証状態の変化を購読する。返り値の `unsubscribe()` で解除。
 * Supabase 未設定なら何もせず、no-op の unsubscribe を返す。
 */
export function onAuthStateChange(callback: (session: Session | null) => void): {
  unsubscribe: () => void;
} {
  if (!supabase) return { unsubscribe: () => undefined };
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return { unsubscribe: () => (subscription as Subscription).unsubscribe() };
}
