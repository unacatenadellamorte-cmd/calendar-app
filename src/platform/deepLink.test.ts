import { describe, expect, it, vi } from 'vitest';

/**
 * `onDeepLink` は `@capacitor/app` の appUrlOpen イベントを右から左に流すだけの
 * 薄いラッパであること(パース・ナビゲーション判断を持たないこと)を検証する。
 */
const addListenerMock = vi.fn();
vi.mock('@capacitor/app', () => ({
  App: { addListener: (...args: unknown[]) => addListenerMock(...args) },
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

    const handler = vi.fn();
    onDeepLink(handler);

    capturedHandler?.({ url: 'calendar-app://event/abc-123' });
    expect(handler).toHaveBeenCalledWith('calendar-app://event/abc-123');
  });

  it('返り値の解除関数を呼ぶとリスナーの remove() が呼ばれる', async () => {
    const removeMock = vi.fn();
    addListenerMock.mockImplementation(() => Promise.resolve({ remove: removeMock }));

    const unsubscribe = onDeepLink(vi.fn());
    unsubscribe();
    // addListener の Promise 解決を待つ。
    await Promise.resolve();
    await Promise.resolve();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
