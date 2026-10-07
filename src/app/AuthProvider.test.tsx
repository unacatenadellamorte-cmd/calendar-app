import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ok } from '@/data/result';
import { ACCOUNT_DELETION_KEY, writeDeletion } from '@/data/account-deletion-state';
import { firstRunKey } from '@/features/onboarding/model/first-run-state';

const isAuthAvailable = vi.fn();
const getSession = vi.fn();
const signInAnonymously = vi.fn();
const signOut = vi.fn();
const deleteMyAccount = vi.fn();
let authStateHandler: ((s: unknown) => void) | undefined;
const unsubscribe = vi.fn();

vi.mock('@/data/auth', () => ({
  isAuthAvailable: () => isAuthAvailable(),
  getSession: () => getSession(),
  signInAnonymously: () => signInAnonymously(),
  signOut: () => signOut(),
  deleteMyAccount: (...args: unknown[]) => deleteMyAccount(...args),
  onAuthStateChange: (cb: (s: unknown) => void) => {
    authStateHandler = cb;
    return { unsubscribe };
  },
}));

// AuthProvider は上のモックの後に import する
const { AuthProvider } = await import('./AuthProvider');
const { useAuth } = await import('./auth-context');

function Probe() {
  const { state, email } = useAuth();
  return (
    <div data-testid="probe">
      {state}:{email ?? '-'}
    </div>
  );
}

const guestSession = { user: { id: 'anon-1', is_anonymous: true } };
const userSession = { user: { id: 'anon-1', is_anonymous: false, email: 'a@b.com' } };

beforeEach(() => {
  isAuthAvailable.mockReset();
  getSession.mockReset();
  signInAnonymously.mockReset();
  signOut.mockReset();
  deleteMyAccount.mockReset();
  deleteMyAccount.mockResolvedValue(ok(undefined));
  unsubscribe.mockReset();
  authStateHandler = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('本人削除の成功後は本人の初回進捗だけ消し、別利用者の進捗は保つ', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(null));
    localStorage.setItem(firstRunKey('本人'), 'tutorial');
    localStorage.setItem(firstRunKey('別人'), 'profile');
    writeDeletion({ userId: '本人', phase: 'local' });
    deleteMyAccount.mockImplementation(async () => {
      writeDeletion({ userId: '本人', phase: 'done' });
      return ok(undefined);
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(localStorage.getItem(firstRunKey('本人'))).toBeNull());
    expect(localStorage.getItem(firstRunKey('別人'))).toBe('profile');
    expect(screen.getByText('アカウントを削除しました')).toBeInTheDocument();
  });
  it.each(['', '壊れたJSON', '{"phase":"done"}'])(
    '削除記録が不正でも通常画面や完了画面を出さない: %s',
    async (record) => {
      isAuthAvailable.mockReturnValue(true);
      getSession.mockResolvedValue(ok(null));
      localStorage.setItem(ACCOUNT_DELETION_KEY, record);
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      expect(deleteMyAccount).not.toHaveBeenCalled();
      expect(screen.getByText('保存状態を確認できません')).toBeInTheDocument();
      expect(screen.getByText('再試行できない場合はサポートへ連絡')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '保存状態を再確認' }));
      expect(deleteMyAccount).not.toHaveBeenCalled();
      expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
      expect(signInAnonymously).not.toHaveBeenCalled();
    },
  );

  it('保存領域が読めなくてもクラッシュせず未完了画面で止める', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(null));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('保存領域を利用できない');
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(deleteMyAccount).not.toHaveBeenCalled();
    expect(screen.getByText('保存状態を再確認')).toBeInTheDocument();
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
  it('保存領域が記録なしで回復したら削除せず再読込する', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(userSession));
    const reload = vi.fn();
    const actualWindow = window;
    vi.stubGlobal(
      'window',
      new Proxy(actualWindow, {
        get: (target, key) =>
          key === 'location' ? { reload } : Reflect.get(target, key, target),
      }),
    );
    const storageRead = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('読取失敗');
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('保存状態を確認できません')).toBeInTheDocument();
    await act(async () => {});
    await act(async () => {
      storageRead.mockRestore();
      fireEvent.click(screen.getByRole('button', { name: '保存状態を再確認' }));
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(deleteMyAccount).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('別タブの削除開始をstorageイベントで受けて旧画面を隠す', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(userSession));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated'),
    );
    const record = JSON.stringify({ userId: 'anon-1', phase: 'remote' });
    act(() => {
      localStorage.setItem(ACCOUNT_DELETION_KEY, record);
      window.dispatchEvent(
        new StorageEvent('storage', { key: ACCOUNT_DELETION_KEY, newValue: record }),
      );
    });
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(screen.getByText('アカウントの削除中です')).toBeInTheDocument();
  });

  it('削除完了後は明示ボタンを押したときだけ記録を消して新規起動する', () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(null));
    const replace = vi.fn();
    const actualWindow = window;
    vi.stubGlobal(
      'window',
      new Proxy(actualWindow, {
        get: (target, key) =>
          key === 'location' ? { replace } : Reflect.get(target, key, target),
      }),
    );
    writeDeletion({ userId: '本人', phase: 'done' });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(localStorage.getItem(ACCOUNT_DELETION_KEY)).not.toBeNull();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '新しく使い始める' }));
    expect(localStorage.getItem(ACCOUNT_DELETION_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('削除完了後の再起動で旧画面や匿名アカウントを作らない', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(null));
    writeDeletion({ userId: '旧本人', phase: 'done' });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('アカウントを削除しました')).toBeInTheDocument();
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    await act(async () => {
      authStateHandler?.(null);
    });
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(deleteMyAccount).not.toHaveBeenCalled();
  });

  it('中断記録があれば通常画面を隠して削除を再開する', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(null));
    writeDeletion({ userId: '旧本人', phase: 'local' });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalledTimes(1));
    expect(deleteMyAccount).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
  it('Supabase 未設定なら state=unavailable、非同期処理を走らせない', async () => {
    isAuthAvailable.mockReturnValue(false);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('unavailable:-');
    expect(getSession).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('セッション無し → 匿名サインインして state=guest', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(null));
    signInAnonymously.mockResolvedValue(ok(guestSession));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('guest:-'));
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('既存のメールセッション → state=authenticated', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(userSession));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated:a@b.com'),
    );
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('onAuthStateChange で state が更新される', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(guestSession));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('guest:-'));

    act(() => authStateHandler?.(userSession));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated:a@b.com'),
    );
  });

  it('サインアウトでセッションが消えたら匿名セッションを張り直す', async () => {
    isAuthAvailable.mockReturnValue(true);
    getSession.mockResolvedValue(ok(userSession));
    signInAnonymously.mockResolvedValue(ok(guestSession));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated:a@b.com'),
    );

    await act(async () => {
      authStateHandler?.(null);
    });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('guest:-'));
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });
});
