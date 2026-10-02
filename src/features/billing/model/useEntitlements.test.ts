import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';

/**
 * useEntitlements の検証。`@/data/entitlements` の取得だけをモックし、
 * 有効判定(isEntitlementActive)は実装をそのまま使う。
 */

const listMyEntitlements = vi.fn();
let authState: { state: string; session: { user: { id: string } } | null } = {
  state: 'authenticated',
  session: { user: { id: 'u1' } },
};
let envValue = { hasSupabase: true };

vi.mock('@/data/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/entitlements')>();
  return { ...actual, listMyEntitlements: () => listMyEntitlements() };
});
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));

const { useEntitlements, deriveEntitlements } = await import('./useEntitlements');

const NOW = Date.parse('2026-10-02T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  listMyEntitlements.mockReset().mockResolvedValue(ok([]));
  authState = { state: 'authenticated', session: { user: { id: 'u1' } } };
  envValue = { hasSupabase: true };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('deriveEntitlements', () => {
  it('multi_account は予定反映も含む(canWrite)', () => {
    expect(deriveEntitlements([{ entitlement: 'multi_account', expiresAt: null }], NOW)).toEqual({
      hasMultiAccount: true,
      canWrite: true,
    });
  });
  it('calendar_write だけなら canWrite のみ', () => {
    expect(deriveEntitlements([{ entitlement: 'calendar_write', expiresAt: null }], NOW)).toEqual({
      hasMultiAccount: false,
      canWrite: true,
    });
  });
  it('期限切れは無効', () => {
    expect(
      deriveEntitlements(
        [
          { entitlement: 'multi_account', expiresAt: '2026-10-01T00:00:00Z' },
          { entitlement: 'calendar_write', expiresAt: '2026-09-01T00:00:00Z' },
        ],
        NOW,
      ),
    ).toEqual({ hasMultiAccount: false, canWrite: false });
  });
  it('行なしは権利なし', () => {
    expect(deriveEntitlements([], NOW)).toEqual({ hasMultiAccount: false, canWrite: false });
  });
});

describe('useEntitlements', () => {
  it('有効期限が未来の multi_account: hasMultiAccount / canWrite が真', async () => {
    listMyEntitlements.mockResolvedValue(
      ok([{ entitlement: 'multi_account', expiresAt: '2026-11-01T00:00:00Z' }]),
    );
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.loading).toBe(true);
    expect(result.current.hasMultiAccount).toBe(false); // 取得中は権利なし扱い
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMultiAccount).toBe(true);
    expect(result.current.canWrite).toBe(true);
  });

  it('expires_at が null(無期限)は有効', async () => {
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'calendar_write', expiresAt: null }]));
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canWrite).toBe(true);
    expect(result.current.hasMultiAccount).toBe(false);
  });

  it('期限切れは権利なし', async () => {
    listMyEntitlements.mockResolvedValue(
      ok([{ entitlement: 'multi_account', expiresAt: '2026-10-02T11:59:59Z' }]),
    );
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMultiAccount).toBe(false);
    expect(result.current.canWrite).toBe(false);
  });

  it('取得失敗は権利なし', async () => {
    listMyEntitlements.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMultiAccount).toBe(false);
    expect(result.current.canWrite).toBe(false);
  });

  it.each(['guest', 'loading', 'unavailable'])('未ログイン(%s)は取得せず権利なし', (state) => {
    authState = { state, session: null };
    const { result } = renderHook(() => useEntitlements());
    expect(listMyEntitlements).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMultiAccount).toBe(false);
    expect(result.current.canWrite).toBe(false);
  });

  it('Supabase 未設定は取得せず権利なし', () => {
    envValue = { hasSupabase: false };
    const { result } = renderHook(() => useEntitlements());
    expect(listMyEntitlements).not.toHaveBeenCalled();
    expect(result.current.hasMultiAccount).toBe(false);
  });

  it('ログアウトしたら直前の権利を捨てる', async () => {
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'multi_account', expiresAt: null }]));
    const { result, rerender } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.hasMultiAccount).toBe(true));
    authState = { state: 'guest', session: null };
    rerender();
    expect(result.current.hasMultiAccount).toBe(false);
    expect(result.current.canWrite).toBe(false);
  });

  it('reload で取り直す', async () => {
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'multi_account', expiresAt: null }]));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.hasMultiAccount).toBe(true));
    expect(listMyEntitlements).toHaveBeenCalledTimes(2);
  });
});
