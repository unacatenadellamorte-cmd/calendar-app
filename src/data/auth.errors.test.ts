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

  it('分類できないものは auth/unknown にする', () => {
    const e = normalizeAuthError(new Error('something odd'));
    expect(e.messageKey).toBe('auth/unknown');
  });
});
