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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it('guest の signup は upgradeToPassword を呼び、即時完了なら onSuccess を呼ぶ', async () => {
    upgradeToPassword.mockResolvedValue(ok({ status: 'complete' }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest: true, onSuccess }));
    await fillAndSubmit(result, 'signup');
    expect(upgradeToPassword).toHaveBeenCalledWith('a@b.com', 'secret1');
    expect(signUpWithPassword).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.form.pendingEmail).toBeNull();
  });

  it('非 guest の signup は signUpWithPassword を呼ぶ', async () => {
    signUpWithPassword.mockResolvedValue(ok({ status: 'complete' }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest: false, onSuccess }));
    await fillAndSubmit(result, 'signup');
    expect(signUpWithPassword).toHaveBeenCalledWith('a@b.com', 'secret1');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['guest', true, upgradeToPassword],
    ['非 guest', false, signUpWithPassword],
  ])('%s の確認待ちは onSuccess を呼ばず、送信先を残してパスワードを消す', async (_label, isGuest, request) => {
    request.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest, onSuccess }));
    await fillAndSubmit(result, 'signup');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.form).toMatchObject({
      pendingEmail: 'a@b.com',
      password: '',
      submitting: false,
      errorKey: null,
    });
  });

  it('確認待ちの直後に同じ宛先へ出し直しても再送せず、時間をおけば送れる', async () => {
    vi.useFakeTimers();
    upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
    const { result } = renderHook(() => useAuthForm({ isGuest: true }));
    await fillAndSubmit(result, 'signup');
    act(() => result.current.setMode('signup'));
    expect(result.current.form.pendingEmail).toBeNull();

    await fillAndSubmit(result, 'signup', 'A@b.com');
    expect(upgradeToPassword).toHaveBeenCalledTimes(1);
    expect(result.current.form.errorKey).toBe('auth/confirmation-recently-sent');

    vi.advanceTimersByTime(60_000);
    await fillAndSubmit(result, 'signup');
    expect(upgradeToPassword).toHaveBeenCalledTimes(2);
  });

  it('確認待ちからログイン・別メールでの登録へ戻れる', async () => {
    upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
    signInWithPassword.mockResolvedValue(ok({ user: { id: 'u1' } }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest: true, onSuccess }));
    await fillAndSubmit(result, 'signup');

    act(() => result.current.changeEmail());
    expect(result.current.form).toMatchObject({ mode: 'signup', email: '', pendingEmail: null });
    await fillAndSubmit(result, 'signup', 'c@d.com');
    expect(upgradeToPassword).toHaveBeenLastCalledWith('c@d.com', 'secret1');

    act(() => result.current.setMode('signin'));
    expect(result.current.form).toMatchObject({ mode: 'signin', email: 'c@d.com', pendingEmail: null });
    act(() => result.current.setPassword('secret1'));
    await act(async () => {
      await result.current.submit();
    });
    expect(signInWithPassword).toHaveBeenCalledWith('c@d.com', 'secret1');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('送信上限のエラーはその場に留まり messageKey を反映する', async () => {
    upgradeToPassword.mockResolvedValue(
      err(appError('auth/email-rate-limited', 'auth/email-rate-limited')),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest: true, onSuccess }));
    await fillAndSubmit(result, 'signup');
    expect(result.current.form).toMatchObject({
      errorKey: 'auth/email-rate-limited',
      pendingEmail: null,
      submitting: false,
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('連打しても送信は1回だけ', async () => {
    const pending = deferred();
    upgradeToPassword.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAuthForm({ isGuest: true }));
    act(() => result.current.setMode('signup'));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    let first!: Promise<void>;
    act(() => {
      // 同じ描画内の2回目は、submitting の反映前でも受け付けない。
      first = result.current.submit();
      void result.current.submit();
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(upgradeToPassword).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
      await first;
    });
    expect(result.current.form.pendingEmail).toBe('a@b.com');
  });

  it('送信中のモード・入力変更は無視し、応答を別モードへ取り違えない', async () => {
    const pending = deferred();
    upgradeToPassword.mockReturnValue(pending.promise);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ isGuest: true, onSuccess }));
    act(() => result.current.setMode('signup'));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    let first!: Promise<void>;
    act(() => {
      first = result.current.submit();
    });
    act(() => {
      result.current.setMode('signin');
      result.current.setEmail('other@b.com');
      result.current.changeEmail();
    });
    expect(result.current.form).toMatchObject({ mode: 'signup', email: 'a@b.com', submitting: true });
    await act(async () => {
      pending.resolve(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
      await first;
    });
    expect(result.current.form).toMatchObject({ mode: 'signup', pendingEmail: 'a@b.com' });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('画面を離れた後に届いた応答では遷移しない', async () => {
    const pending = deferred();
    signInWithPassword.mockReturnValue(pending.promise);
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(() => useAuthForm({ isGuest: false, onSuccess }));
    act(() => result.current.setEmail('a@b.com'));
    act(() => result.current.setPassword('secret1'));
    let first!: Promise<void>;
    act(() => {
      first = result.current.submit();
    });
    unmount();
    pending.resolve(ok({ user: { id: 'u1' } }));
    await first;
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('パスワードをログと永続ストレージへ出さない', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
    const { result } = renderHook(() => useAuthForm({ isGuest: true }));
    await fillAndSubmit(result, 'signup');
    const stored = JSON.stringify([{ ...localStorage }, { ...sessionStorage }]);
    expect(stored).not.toContain('secret1');
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain('secret1');
    expect(JSON.stringify(result.current.form)).not.toContain('secret1');
  });
});

type Hook = { current: ReturnType<typeof useAuthForm> };

async function fillAndSubmit(result: Hook, mode: 'signin' | 'signup', email = 'a@b.com') {
  act(() => result.current.setMode(mode));
  act(() => result.current.setEmail(email));
  act(() => result.current.setPassword('secret1'));
  await act(async () => {
    await result.current.submit();
  });
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
