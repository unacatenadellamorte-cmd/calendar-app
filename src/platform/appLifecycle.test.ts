import { describe, expect, it, vi } from 'vitest';

/**
 * `onAppResume` は `@capacitor/app` の resume イベントを右から左に流すだけの
 * 薄いラッパであること(判断を持たないこと)を検証する(`deepLink.test.ts` と対の形)。
 */
const addListenerMock = vi.fn();
vi.mock('@capacitor/app', () => ({
  App: { addListener: (...args: unknown[]) => addListenerMock(...args) },
}));

const { onAppResume } = await import('./appLifecycle');

describe('onAppResume', () => {
  it('resume を購読し、発火のたびに handler を呼ぶ', () => {
    let capturedHandler: (() => void) | undefined;
    addListenerMock.mockImplementation((eventName: string, handler: () => void) => {
      expect(eventName).toBe('resume');
      capturedHandler = handler;
      return Promise.resolve({ remove: vi.fn() });
    });

    const handler = vi.fn();
    onAppResume(handler);

    capturedHandler?.();
    capturedHandler?.();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('返り値の解除関数を呼ぶとリスナーの remove() が呼ばれる', async () => {
    const removeMock = vi.fn();
    addListenerMock.mockImplementation(() => Promise.resolve({ remove: removeMock }));

    const unsubscribe = onAppResume(vi.fn());
    unsubscribe();
    await Promise.resolve();
    await Promise.resolve();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
