import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { registerLayerBack } from './layerBack';

const mocks = vi.hoisted(() => ({
  callbacks: [] as (() => void)[],
  remove: vi.fn(),
  platform: 'android',
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((_event, callback: () => void) => {
      mocks.callbacks.push(callback);
      return Promise.resolve({ remove: mocks.remove });
    }),
  },
}));

describe('Androidレイヤー戻る', () => {
  it('最前面だけを閉じ、解除後や非同期解除の待機中には呼ばない', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = registerLayerBack(first);
    const releaseSecond = registerLayerBack(second);
    mocks.callbacks.forEach((callback) => callback());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    releaseSecond();
    mocks.callbacks.forEach((callback) => callback());
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    releaseFirst();
    mocks.callbacks.forEach((callback) => callback());
    expect(first).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});

describe('Webのレイヤー戻る', () => {
  it('履歴状態を保持し、最前面から順に閉じて元ページに残る', async () => {
    mocks.platform = 'web';
    history.replaceState({ idx: 4, usr: { keep: true } }, '', '/calendar');
    const first = vi.fn(() => releaseFirst());
    const releaseFirst = registerLayerBack(first);
    const second = vi.fn(() => releaseSecond());
    const releaseSecond = registerLayerBack(second);
    expect(history.state.usr).toEqual({ keep: true });
    history.back();
    await waitFor(() => expect(second).toHaveBeenCalledOnce());
    expect(first).not.toHaveBeenCalled();
    await waitFor(() => expect(history.state.__calendarLayer).toBeDefined());
    history.back();
    await waitFor(() => expect(first).toHaveBeenCalledOnce());
    expect(location.pathname).toBe('/calendar');
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('画面内で閉じた後は余計な履歴が残らず、次の戻るで元の画面へ戻る', async () => {
    mocks.platform = 'web';
    history.replaceState({}, '', '/');
    history.pushState({}, '', '/calendar');
    const close = vi.fn();
    const release = registerLayerBack(close);
    release();
    await waitFor(() => expect(history.state.__calendarLayer).toBeUndefined());
    history.back();
    await waitFor(() => expect(location.pathname).toBe('/'));
    expect(close).not.toHaveBeenCalled();
  });

  it('別ルートへ移動して解除された場合は新しいルートを勝手に戻さない', async () => {
    mocks.platform = 'web';
    history.replaceState({}, '', '/calendar');
    const release = registerLayerBack(vi.fn());
    history.pushState({}, '', '/settings');
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(location.pathname).toBe('/settings');
  });
});
