import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, authMessage, normalizeAuthError } from './auth.errors';

describe('authMessage', () => {
  it('既知のキーを日本語文言に解決する', () => {
    expect(authMessage('auth/invalid-credentials')).toBe(
      'メールアドレスかパスワードが違います',
    );
    expect(authMessage('auth/unavailable')).toBe(AUTH_MESSAGES['auth/unavailable']);
  });

  it('未知のキーは汎用文言にフォールバックする', () => {
    expect(authMessage('auth/does-not-exist')).toBe(AUTH_MESSAGES['auth/unknown']);
  });
});

describe('normalizeAuthError', () => {
  it('ネットワーク系メッセージを auth/network にする', () => {
    const e = normalizeAuthError(new Error('Failed to fetch'));
    expect(e.kind).toBe('auth/network');
  });

  const apiError = (code: string, message: string, status: number) =>
    Object.assign(new Error(message), { code, status });

  it('メール未確認と確認メールの送信上限を、一般の試行制限と分けて案内する', () => {
    expect(normalizeAuthError(apiError('email_not_confirmed', 'Email not confirmed', 400)).messageKey).toBe(
      'auth/email-not-confirmed',
    );
    expect(
      normalizeAuthError(apiError('over_email_send_rate_limit', 'email rate limit exceeded', 429)).messageKey,
    ).toBe('auth/email-rate-limited');
    expect(normalizeAuthError(apiError('over_request_rate_limit', 'Too many requests', 429)).messageKey).toBe(
      'auth/rate-limited',
    );
    for (const key of ['auth/email-not-confirmed', 'auth/email-rate-limited', 'auth/confirmation-recently-sent']) {
      expect(authMessage(key)).not.toBe(AUTH_MESSAGES['auth/unknown']);
      expect(authMessage(key)).not.toBe(AUTH_MESSAGES['auth/rate-limited']);
    }
  });

  it('資格情報の不一致は、アカウントの有無や確認状態を示さない文言のままにする', () => {
    const e = normalizeAuthError(apiError('invalid_credentials', 'Invalid login credentials', 400));
    expect(e.messageKey).toBe('auth/invalid-credentials');
    expect(authMessage(e.messageKey)).toBe('メールアドレスかパスワードが違います');
  });

  it('分類できないものは auth/unknown にする', () => {
    const e = normalizeAuthError(new Error('something odd'));
    expect(e.messageKey).toBe('auth/unknown');
  });
});
