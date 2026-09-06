import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `@/data/supabase` をモックして auth.ts を検証する。
 * Docker 未導入で Supabase ローカルが起動できないため、結合テストの代わり。
 */

type AuthMock = {
  getSession: ReturnType<typeof vi.fn>;
  signInAnonymously: ReturnType<typeof vi.fn>;
  signUp: ReturnType<typeof vi.fn>;
  signInWithPassword: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
};

const authMock: AuthMock = {
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
};

let supabaseValue: { auth: AuthMock } | null = { auth: authMock };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

async function importAuth() {
  return import('./auth');
}

const fakeSession = (overrides: Record<string, unknown> = {}) => ({
  user: { id: 'u1', is_anonymous: false, email: 'a@b.com', ...overrides },
});
const authErr = (message: string, code?: string) => ({ message, code, name: 'AuthApiError' });

beforeEach(() => {
  vi.resetModules();
  supabaseValue = { auth: authMock };
  Object.values(authMock).forEach((fn) => fn.mockReset());
  authMock.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('auth.ts', () => {
  it('looksLikeEmail は緩くメール形式を判定する', async () => {
    const { looksLikeEmail } = await importAuth();
    expect(looksLikeEmail('a@b.com')).toBe(true);
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    expect(looksLikeEmail('nope')).toBe(false);
  });

  it('signUpWithPassword: 成功でセッションを返す', async () => {
    authMock.signUp.mockResolvedValue({ data: { session: fakeSession() }, error: null });
    const { signUpWithPassword } = await importAuth();
    const r = await signUpWithPassword(' a@b.com ', 'secret1');
    expect(r.ok).toBe(true);
    expect(authMock.signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret1' });
  });

  it('signInWithPassword: 成功でセッションを返す', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { session: fakeSession() },
      error: null,
    });
    const { signInWithPassword } = await importAuth();
    const r = await signInWithPassword(' a@b.com ', 'secret1');
    expect(r.ok).toBe(true);
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret1',
    });
  });

  it('signInWithPassword: 資格情報不一致を messageKey に正規化する', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: authErr('Invalid login credentials', 'invalid_credentials'),
    });
    const { signInWithPassword } = await importAuth();
    const r = await signInWithPassword('a@b.com', 'wrongpw');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('auth/invalid-credentials');
  });

  it('signUpWithPassword: 弱いパスワードを messageKey に正規化する', async () => {
    authMock.signUp.mockResolvedValue({
      data: { session: null },
      error: authErr('Password should be at least 6 characters', 'weak_password'),
    });
    const { signUpWithPassword } = await importAuth();
    const r = await signUpWithPassword('a@b.com', 'abcdef');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('auth/weak-password');
  });

  it('signUpWithPassword: 登録済みメールを messageKey に正規化する', async () => {
    authMock.signUp.mockResolvedValue({
      data: { session: null },
      error: authErr('User already registered', 'user_already_exists'),
    });
    const { signUpWithPassword } = await importAuth();
    const r = await signUpWithPassword('a@b.com', 'secret1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('auth/email-taken');
  });

  it('signInAnonymously: 成功で guest セッション', async () => {
    authMock.signInAnonymously.mockResolvedValue({
      data: { session: fakeSession({ is_anonymous: true, email: undefined }) },
      error: null,
    });
    const { signInAnonymously } = await importAuth();
    const r = await signInAnonymously();
    expect(r.ok).toBe(true);
  });

  it('upgradeToPassword: updateUser を呼ぶ', async () => {
    authMock.updateUser.mockResolvedValue({ data: { user: fakeSession().user }, error: null });
    const { upgradeToPassword } = await importAuth();
    const r = await upgradeToPassword('a@b.com', 'secret1');
    expect(r.ok).toBe(true);
    expect(authMock.updateUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret1',
    });
  });

  it('signOut: 成功で ok(void)', async () => {
    authMock.signOut.mockResolvedValue({ error: null });
    const { signOut } = await importAuth();
    const r = await signOut();
    expect(r.ok).toBe(true);
  });

  it('Supabase 未設定なら unavailable エラーを返し、supabase を呼ばない', async () => {
    supabaseValue = null;
    const { signInWithPassword, getSession, isAuthAvailable } = await importAuth();
    expect(isAuthAvailable()).toBe(false);
    const r = await signInWithPassword('a@b.com', 'secret1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('auth/unavailable');
    const s = await getSession();
    expect(s.ok).toBe(false);
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it('onAuthStateChange: セッション変化をコールバックに渡し、unsubscribe できる', async () => {
    const unsubscribe = vi.fn();
    let handler: ((event: string, session: unknown) => void) | undefined;
    authMock.onAuthStateChange.mockImplementation((cb: typeof handler) => {
      handler = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    const { onAuthStateChange } = await importAuth();
    const received: unknown[] = [];
    const sub = onAuthStateChange((s) => received.push(s));
    handler?.('SIGNED_IN', fakeSession());
    expect(received).toHaveLength(1);
    sub.unsubscribe();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
