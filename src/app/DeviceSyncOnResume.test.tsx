import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ok } from '@/data/result';

/**
 * `DeviceSyncOnResume` は onAppResume を購読し、発火のたびに
 * syncDeviceCalendarsNow を呼ぶだけの非表示コンポーネントであることを検証する
 * (`DeepLinkListener.test.tsx` と対の形)。
 */
let capturedHandler: (() => void) | undefined;
const unsubscribeMock = vi.fn();
let currentUser = 'user-1';
vi.mock('@/app/auth-context', () => ({ useAuth: () => ({ state: 'guest', session: { user: { id: currentUser } } }) }));
vi.mock('@/platform/appLifecycle', () => ({
  onAppResume: (handler: () => void) => {
    capturedHandler = handler;
    return unsubscribeMock;
  },
}));

const syncDeviceCalendarsNow = vi.fn();
vi.mock('@/data/device-sync', () => ({
  syncDeviceCalendarsNow: (...a: unknown[]) => syncDeviceCalendarsNow(...a),
}));
const notifyDataRefresh = vi.fn();
vi.mock('@/app/data-refresh-notification', () => ({ notifyDataRefresh: (...a: unknown[]) => notifyDataRefresh(...a) }));

const { DeviceSyncOnResume } = await import('./DeviceSyncOnResume');

beforeEach(() => {
  unsubscribeMock.mockClear();
  capturedHandler = undefined;
  syncDeviceCalendarsNow.mockReset().mockResolvedValue(ok({ synced: [], errors: [] }));
  notifyDataRefresh.mockReset();
  currentUser = 'user-1';
});

describe('DeviceSyncOnResume', () => {
  it('マウント時に onAppResume を購読する', () => {
    render(<DeviceSyncOnResume />);
    expect(capturedHandler).toBeDefined();
  });

  it('resume が発火するたびに syncDeviceCalendarsNow を呼ぶ', () => {
    render(<DeviceSyncOnResume />);
    capturedHandler?.();
    capturedHandler?.();
    expect(syncDeviceCalendarsNow).toHaveBeenCalledTimes(2);
  });

  it('何も描画しない(UI 無し)', () => {
    const { container } = render(<DeviceSyncOnResume />);
    expect(container).toBeEmptyDOMElement();
  });

  it('アンマウント時に購読を解除する', () => {
    const { unmount } = render(<DeviceSyncOnResume />);
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('失敗を処理し、アンマウント後の成功では更新通知を出さない', async () => {
    const { unmount } = render(<DeviceSyncOnResume />);
    syncDeviceCalendarsNow.mockRejectedValueOnce(new Error('offline'));
    capturedHandler?.();
    await Promise.resolve();
    let resolveSync!: (value: unknown) => void;
    syncDeviceCalendarsNow.mockReturnValueOnce(new Promise((resolve) => { resolveSync = resolve; }));
    capturedHandler?.();
    unmount();
    resolveSync(ok({ synced: [], errors: [] }));
    await Promise.resolve();
    expect(notifyDataRefresh).not.toHaveBeenCalled();
  });
});
