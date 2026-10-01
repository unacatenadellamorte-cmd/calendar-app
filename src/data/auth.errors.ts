import { t } from '@/i18n';
import type { AuthError } from '@supabase/supabase-js';
import { appError, type AppError } from './result';

/**
 * Supabase の認証エラーを、UI 用の日本語 messageKey に対応づける。
 * messageKey は表示層(AuthScreen 等)が文言に解決する。コードや英語メッセージは出さない。
 */

export const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credentials': 'メールアドレスかパスワードが違います',
  'auth/email-taken': 'このメールアドレスは登録済みです',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/rate-limited': '試行が多すぎます。少し時間をおいてください',
  'auth/email-not-confirmed':
    'メールアドレスの確認が完了していません。確認メールのリンクを開いてからログインしてください',
  'auth/email-rate-limited':
    '確認メールの送信回数が上限に達しました。届いている最新のメールを確認するか、時間をおいてください',
  'auth/confirmation-recently-sent':
    '確認メールは送信済みです。最新のメールを確認するか、1分ほど待ってからお試しください',
  'auth/unavailable': 'ローカル開発では認証は無効です',
  'auth/network': '通信に失敗しました。接続を確認してください',
  'auth/unknown': 'エラーが発生しました。もう一度お試しください',
};

/** messageKey を日本語文言に解決する。未知のキーは汎用文言。 */
export function authMessage(messageKey: string): string {
  return t(AUTH_MESSAGES[messageKey] ?? AUTH_MESSAGES['auth/unknown']!);
}

/** Supabase の AuthError を AppError に正規化する。 */
export function normalizeAuthError(error: AuthError | Error): AppError {
  const code = 'code' in error ? (error.code ?? '') : '';
  const status = 'status' in error ? (error.status ?? 0) : 0;
  const raw = `${code} ${error.message}`.toLowerCase();

  if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) {
    return appError('auth/invalid-credentials', 'auth/invalid-credentials', error);
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    raw.includes('already registered') ||
    raw.includes('already been registered')
  ) {
    return appError('auth/email-taken', 'auth/email-taken', error);
  }
  if (code === 'weak_password' || raw.includes('password should be at least')) {
    return appError('auth/weak-password', 'auth/weak-password', error);
  }
  if (code === 'validation_failed' && raw.includes('email')) {
    return appError('auth/invalid-email', 'auth/invalid-email', error);
  }
  if (code === 'email_not_confirmed' || raw.includes('email not confirmed')) {
    return appError('auth/email-not-confirmed', 'auth/email-not-confirmed', error);
  }
  // 確認メールの送信上限は 429 でも、待てば届く旨を別文言で案内する。
  if (code === 'over_email_send_rate_limit' || raw.includes('email rate limit exceeded')) {
    return appError('auth/email-rate-limited', 'auth/email-rate-limited', error);
  }
  if (code === 'over_request_rate_limit' || status === 429) {
    return appError('auth/rate-limited', 'auth/rate-limited', error);
  }
  if (raw.includes('fetch') || raw.includes('network')) {
    return appError('auth/network', 'auth/network', error);
  }
  return appError('auth/unknown', 'auth/unknown', error);
}
