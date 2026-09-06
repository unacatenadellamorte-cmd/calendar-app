import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ok } from '@/data/result';

const isAuthAvailable = vi.fn();
const getSession = vi.fn();
const signInAnonymously = vi.fn();
const signOut = vi.fn();
let authStateHandler: ((s: unknown) => void) | undefined;
const unsubscribe = vi.fn();

vi.mock('@/data/auth', () => ({
  isAuthAvailable: () => isAuthAvailable(),
  getSession: () => getSession(),
  signInAnonymously: () => signInAnonymously(),
  signOut: () => signOut(),
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
  unsubscribe.mockReset();
  authStateHandler = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('AuthProvider', () => {
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
