import { describe, expect, it, vi } from 'vitest';

/**
 * `onDeepLink` は `@capacitor/app` の appUrlOpen イベントと `@capacitor/local-notifications` の
 * localNotificationActionPerformed イベントを、どちらも右から左に流すだけの薄いラッパで
 * あること(パース・ナビゲーション判断を持たないこと)を検証する(Story 5.4)。
 */
const addListenerMock = vi.fn();
vi.mock('@capacitor/app', () => ({
  App: { addListener: (...args: unknown[]) => addListenerMock(...args) },
}));

const notificationAddListenerMock = vi.fn();
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: (...args: unknown[]) => notificationAddListenerMock(...args),
  },
}));

const { onDeepLink } = await import('./deepLink');

describe('onDeepLink', () => {
  it('appUrlOpen を購読し、event.url をそのまま handler に渡す', () => {
    let capturedHandler: ((event: { url: string }) => void) | undefined;
    addListenerMock.mockImplementation(
      (eventName: string, handler: (event: { url: string }) => void) => {
        expect(eventName).toBe('appUrlOpen');
        capturedHandler = handler;
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    notificationAddListenerMock.mockReturnValue(Promise.resolve({ remove: vi.fn() }));

    const handler = vi.fn();
    onDeepLink(handler);

    capturedHandler?.({ url: 'calendar-app://event/abc-123' });
    expect(handler).toHaveBeenCalledWith('calendar-app://event/abc-123');
  });

  it('localNotificationActionPerformed を購読し、extra.eventId から calendar-app://event/{id} を合成して handler に渡す', () => {
    addListenerMock.mockReturnValue(Promise.resolve({ remove: vi.fn() }));
    let capturedHandler: ((action: unknown) => void) | undefined;
    notificationAddListenerMock.mockImplementation(
      (eventName: string, handler: (action: unknown) => void) => {
        expect(eventName).toBe('localNotificationActionPerformed');
        capturedHandler = handler;
        return Promise.resolve({ remove: vi.fn() });
      },
    );

    const handler = vi.fn();
    onDeepLink(handler);

    capturedHandler?.({
      actionId: 'tap',
      notification: { id: 1, title: 't', body: 'b', extra: { eventId: 'evt-9' } },
    });
    expect(handler).toHaveBeenCalledWith('calendar-app://event/evt-9');
  });

  it('extra.eventId が無い通知タップは handler を呼ばない', () => {
    addListenerMock.mockReturnValue(Promise.resolve({ remove: vi.fn() }));
    let capturedHandler: ((action: unknown) => void) | undefined;
    notificationAddListenerMock.mockImplementation(
      (_eventName: string, handler: (action: unknown) => void) => {
        capturedHandler = handler;
        return Promise.resolve({ remove: vi.fn() });
      },
    );

    const handler = vi.fn();
    onDeepLink(handler);

    capturedHandler?.({ actionId: 'tap', notification: { id: 1, title: 't', body: 'b' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('返り値の解除関数を呼ぶと両方のリスナーの remove() が呼ばれる', async () => {
    const removeMock = vi.fn();
    const notificationRemoveMock = vi.fn();
    addListenerMock.mockImplementation(() => Promise.resolve({ remove: removeMock }));
    notificationAddListenerMock.mockImplementation(() =>
      Promise.resolve({ remove: notificationRemoveMock }),
    );

    const unsubscribe = onDeepLink(vi.fn());
    unsubscribe();
    // addListener の Promise 解決を待つ。
    await Promise.resolve();
    await Promise.resolve();

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(notificationRemoveMock).toHaveBeenCalledTimes(1);
  });
});
