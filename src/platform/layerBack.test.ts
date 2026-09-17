import { describe, expect, it, vi } from 'vitest';
import { registerLayerBack } from './layerBack';

const mocks = vi.hoisted(() => ({ callbacks: [] as (() => void)[], remove: vi.fn(), platform: 'android' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn((_event, callback: () => void) => {
  mocks.callbacks.push(callback);
  return Promise.resolve({ remove: mocks.remove });
}) } }));

describe('Androidレイヤー戻る', () => {
  it('最前面だけを閉じ、解除後や非同期解除の待機中には呼ばない', async () => {
    const first = vi.fn(); const second = vi.fn();
    const releaseFirst = registerLayerBack(first);
    const releaseSecond = registerLayerBack(second);
    mocks.callbacks.forEach((callback) => callback());
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
    releaseSecond();
    mocks.callbacks.forEach((callback) => callback());
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
    releaseFirst();
    mocks.callbacks.forEach((callback) => callback());
    expect(first).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});
