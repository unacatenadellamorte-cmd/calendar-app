import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';
import { useAuthForm } from './useAuthForm';

const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();
const upgradeToPassword = vi.fn();

vi.mock('@/data/auth', () => ({
  looksLikeEmail: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
  signUpWithPassword: (...a: unknown[]) => signUpWithPassword(...a),
  upgradeToPassword: (...a: unknown[]) => upgradeToPassword(...a),
}));

beforeEach(() => {
  signInWithPassword.mockReset();
  signUpWithPassword.mockReset();
  upgradeToPassword.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('useAuthForm', () => {
  it('不正なメールは送信せず invalid-email を出す', async () => {
    const { result } = renderHook(() => useAuthForm({ isGuest: false }));
    act(() => result.current.setEmail('nope'));
    act(() => result.current.setPassword('secret1'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.form.errorKey).toBe('auth/invalid-email');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('短いパスワードは送信せず weak-password を出す', async () => {
    const { result } = renderHook(() => useAuthForm({ isGuest: false }));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('123'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.form.errorKey).toBe('auth/weak-password');
  });

  it('signin 成功で onSuccess を呼び、パスワードをクリアする', async () => {
    signInWithPassword.mockResolvedValue(ok({ user: { id: 'u1' } }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest: false, onSuccess }));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    await act(async () => {
      await result.current.submit();
    });
    expect(signInWithPassword).toHaveBeenCalledWith('a@b.com', 'secret1');
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.form.password).toBe('');
  });

  it('signin 失敗でエラー messageKey を反映する', async () => {
    signInWithPassword.mockResolvedValue(
      err(appError('auth/invalid-credentials', 'auth/invalid-credentials')),
    );
    const { result } = renderHook(() => useAuthForm({ isGuest: false }));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.form.errorKey).toBe('auth/invalid-credentials');
  });

  it('guest の signup は upgradeToPassword を呼ぶ', async () => {
    upgradeToPassword.mockResolvedValue(ok(undefined));
    const { result } = renderHook(() => useAuthForm({ isGuest: true }));
    act(() => result.current.setMode('signup'));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    await act(async () => {
      await result.current.submit();
    });
    expect(upgradeToPassword).toHaveBeenCalledWith('a@b.com', 'secret1');
    expect(signUpWithPassword).not.toHaveBeenCalled();
  });

  it('非 guest の signup は signUpWithPassword を呼ぶ', async () => {
    signUpWithPassword.mockResolvedValue(ok({ user: { id: 'u1' } }));
    const { result } = renderHook(() => useAuthForm({ isGuest: false }));
    act(() => result.current.setMode('signup'));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    await act(async () => {
      await result.current.submit();
    });
    expect(signUpWithPassword).toHaveBeenCalledWith('a@b.com', 'secret1');
  });
});
