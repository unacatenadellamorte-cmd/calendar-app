import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type Result } from './result';
import { normalizeAuthError } from './auth.errors';
import { readDeletion, writeDeletion, isAccountDataBlocked } from './account-deletion-state';

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
  if (isAccountDataBlocked()) return err(appError('auth/deletion-pending', 'auth/deletion-pending'));
  if (!supabase) return err(UNAVAILABLE);
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return err(normalizeAuthError(error));
  return ok(data.session);
}

let deletionInFlight: Promise<Result<void>> | null = null;

/** 本人の削除と中断後の再試行。任意ユーザーIDは受け取らない。 */
export function deleteMyAccount(resumeOnly = false): Promise<Result<void>> {
  if (deletionInFlight) return deletionInFlight;
  const run = runAccountDeletion(resumeOnly).finally(() => { deletionInFlight = null; });
  deletionInFlight = run;
  return run;
}

async function runAccountDeletion(resumeOnly: boolean): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    let record = readDeletion();
    if (resumeOnly && (!record || !record.userId)) return err(appError('auth/deletion-pending', 'auth/deletion-pending'));
    if (record?.phase === 'done') return ok(undefined);
    if (!record || record.phase === 'remote') {
      const current = await getSession();
      if (!current.ok) return current;
      if (!current.value || (record && record.userId !== current.value.user.id)) {
        return err(appError('auth/deletion-pending', 'auth/deletion-pending'));
      }
      record = { userId: current.value.user.id, phase: 'remote' };
      writeDeletion(record);
      const { error } = await supabase.rpc('delete_my_account')
        .setHeader('Authorization', `Bearer ${current.value.access_token}`);
      if (error) return err(appError('auth/deletion-failed', 'auth/deletion-failed', error));
      record = { ...record, phase: 'local' };
      writeDeletion(record);
    }
    const [{ clearLocalAccountData }, { clearAccountNotifications }, { clearAccountWidgets }] =
      await Promise.all([import('./local-db'), import('@/platform/reminders'), import('@/platform/widget')]);
    // 各工程は冪等。どれか失敗したら local の記録を残す。
    await clearLocalAccountData();
    await clearAccountNotifications();
    await clearAccountWidgets();
    const { storeBackground, applyBackground } = await import('@/features/settings/model/backgroundImage');
    await storeBackground(null);
    applyBackground(null);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return err(normalizeAuthError(error));
    sessionStorage.clear();
    writeDeletion({ ...record, phase: 'done' });
    return ok(undefined);
  } catch (cause) {
    return err(appError('auth/deletion-failed', 'auth/deletion-failed', cause));
  }
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
