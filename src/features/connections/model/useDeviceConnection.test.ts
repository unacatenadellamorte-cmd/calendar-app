import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';

/**
 * useDeviceConnection.ts の検証。既存の呼び出し元テスト(ConnectionsSection.test.tsx 等)は
 * 全部このフックをモックしているため、フック自体(mount 時フェッチ・nonce による再取得)を
 * 検証するのはここだけ。`@/data/device-connections` の `getDeviceConnection` だけをモックする。
 */

const getDeviceConnection = vi.fn();
let authState: { state: string } = { state: 'authenticated' };

vi.mock('@/data/device-connections', () => ({
  getDeviceConnection: () => getDeviceConnection(),
}));
vi.mock('@/app/auth-context', () => ({
  useAuth: () => authState,
}));

const { useDeviceConnection } = await import('./useDeviceConnection');

const connection = { id: 'd1', provider: 'device' as const, createdAt: '2026-09-13T00:00:00Z' };

beforeEach(() => {
  getDeviceConnection.mockReset().mockResolvedValue(ok(null));
  authState = { state: 'authenticated' };
});

describe('useDeviceConnection', () => {
  it('active=false(enabled=false)なら connection=null で取得しない', () => {
    const { result } = renderHook(() => useDeviceConnection(false));
    expect(result.current.connection).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(getDeviceConnection).not.toHaveBeenCalled();
  });

  it('active=false(未ログイン)なら connection=null で取得しない', () => {
    authState = { state: 'guest' };
    const { result } = renderHook(() => useDeviceConnection(true));
    expect(result.current.connection).toBeNull();
    expect(getDeviceConnection).not.toHaveBeenCalled();
  });

  it('active=true・成功: マウント時に取得して connection に反映する', async () => {
    getDeviceConnection.mockResolvedValue(ok(connection));
    const { result } = renderHook(() => useDeviceConnection(true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connection).toEqual(connection);
    expect(result.current.errorKey).toBeNull();
    expect(getDeviceConnection).toHaveBeenCalledTimes(1);
  });

  it('active=true・失敗: errorKey に反映する', async () => {
    getDeviceConnection.mockResolvedValue(
      err(appError('data/query', 'data/query')),
    );
    const { result } = renderHook(() => useDeviceConnection(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKey).toBe('data/query');
    expect(result.current.connection).toBeNull();
  });

  it('refresh() で再取得する', async () => {
    getDeviceConnection.mockResolvedValueOnce(ok(null));
    const { result } = renderHook(() => useDeviceConnection(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connection).toBeNull();

    getDeviceConnection.mockResolvedValueOnce(ok(connection));
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.connection).toEqual(connection));
    expect(getDeviceConnection).toHaveBeenCalledTimes(2);
  });
});
