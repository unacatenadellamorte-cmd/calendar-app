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
    expect(deriveEntitlements([{ entitlement: 'multi_account', expiresAt: null }], NOW)).toMatchObject({
      hasMultiAccount: true,
      canWrite: true,
    });
  });
  it('旧calendar_writeの有効期間も写真表示を含む', () => {
    expect(deriveEntitlements([{ entitlement: 'calendar_write', expiresAt: null }], NOW)).toMatchObject({
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
    ).toMatchObject({ hasMultiAccount: false, canWrite: true });
  });
  it('行なしは権利なし', () => {
    expect(deriveEntitlements([], NOW)).toMatchObject({ hasMultiAccount: false, canWrite: true });
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
    expect(result.current.canWrite).toBe(true);
  });

  it('取得失敗は権利なし', async () => {
    listMyEntitlements.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMultiAccount).toBe(false);
    expect(result.current.canWrite).toBe(true);
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


describe('写真の有料権利と標準Google同期', () => {
  it.each([
    [[], false, false],
    [[{ entitlement: 'device_photos', expiresAt: '2026-11-01T00:00:00Z' }], true, false],
    [[{ entitlement: 'calendar_write', expiresAt: '2026-11-01T00:00:00Z' }], true, false],
    [[{ entitlement: 'multi_account', expiresAt: '2026-11-01T00:00:00Z' }], true, true],
    [[{ entitlement: 'device_photos', expiresAt: '2026-10-01T00:00:00Z' }], false, false],
  ] as const)('契約%j: 写真%s、複数アカウント%s', async (rows, photos, multi) => {
    listMyEntitlements.mockResolvedValue(ok(rows));
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ canWrite: true, canViewPhotos: photos, hasPaidPlan: photos, hasMultiAccount: multi });
  });

  it('通信断では同じ利用者の確認済み期限内だけ写真を利用でき、オンライン失効確認後は復活しない', async () => {
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'device_photos', expiresAt: '2026-11-01T00:00:00Z' }]));
    const first = renderHook(() => useEntitlements());
    await waitFor(() => expect(first.result.current.canViewPhotos).toBe(true));
    first.unmount();
    listMyEntitlements.mockResolvedValue(err(appError('data/offline', 'data/offline')));
    const next = renderHook(() => useEntitlements());
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.canViewPhotos).toBe(true);
    listMyEntitlements.mockResolvedValue(ok([]));
    await act(async () => { await next.result.current.refresh(); });
    expect(next.result.current.canViewPhotos).toBe(false);
    listMyEntitlements.mockResolvedValue(err(appError('data/offline', 'data/offline')));
    act(() => next.result.current.reload());
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.canViewPhotos).toBe(false);
  });

  it('別利用者へ切替えた最初の描画と古い取得完了で前の権利を渡さない', async () => {
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'multi_account', expiresAt: null }]));
    const { result, rerender } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.canViewPhotos).toBe(true));
    let finish!: (value: ReturnType<typeof ok>) => void;
    listMyEntitlements.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    let oldRefresh!: Promise<unknown>;
    act(() => { oldRefresh = result.current.refresh(); });
    authState = { state: 'authenticated', session: { user: { id: 'u2' } } };
    listMyEntitlements.mockResolvedValue(err(appError('data/offline', 'data/offline')));
    rerender();
    expect(result.current.canViewPhotos).toBe(false);
    await act(async () => { finish(ok([{ entitlement: 'multi_account', expiresAt: null }])); await oldRefresh; });
    expect(result.current.canViewPhotos).toBe(false);
  });

  it('別利用者の期限付きキャッシュが残っていても通信断時に採用しない', async () => {
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'device_photos', expiresAt: '2026-11-01T00:00:00Z' }]));
    const { result, rerender } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.canViewPhotos).toBe(true));
    expect(Object.keys(localStorage).some((key) => key.startsWith('calendar-app.entitlements.v1.'))).toBe(true);
    authState = { state: 'authenticated', session: { user: { id: 'u2' } } };
    listMyEntitlements.mockResolvedValue(err(appError('data/offline', 'data/offline')));
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canViewPhotos).toBe(false);
  });

  it('開いたまま有効期限を迎えたら写真を停止しGoogle予定反映は維持する', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    listMyEntitlements.mockResolvedValue(ok([{ entitlement: 'device_photos', expiresAt: new Date(NOW + 1000).toISOString() }]));
    const { result } = renderHook(() => useEntitlements());
    await act(async () => {});
    expect(result.current.canViewPhotos).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    expect(result.current.canViewPhotos).toBe(false);
    expect(result.current.canWrite).toBe(true);
  });
});
