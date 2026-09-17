import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * `WidgetSync` は onAppResume を購読し、発火のたびに refreshFeaturedWidget を
 * 呼ぶだけの非表示コンポーネントであることを検証する(`DeviceSyncOnResume.test.tsx` と対の形)。
 */
let capturedHandler: (() => void) | undefined;
const unsubscribeMock = vi.fn();
vi.mock('@/platform/appLifecycle', () => ({
  onAppResume: (handler: () => void) => {
    capturedHandler = handler;
    return unsubscribeMock;
  },
}));

const refreshFeaturedWidget = vi.fn();
vi.mock('@/platform/widget', () => ({
  refreshFeaturedWidget: (...a: unknown[]) => refreshFeaturedWidget(...a),
}));

let authState: { state: 'loading' | 'guest' | 'authenticated' | 'unavailable'; session: { user: { id: string } } | null } = {
  state: 'guest',
  session: { user: { id: 'user-1' } },
};
vi.mock('./auth-context', () => ({ useAuth: () => authState }));
let language = 'ja';
vi.mock('@/i18n', () => ({ useLanguage: () => language }));

const { WidgetSync } = await import('./WidgetSync');

beforeEach(() => {
  unsubscribeMock.mockClear();
  capturedHandler = undefined;
  refreshFeaturedWidget.mockReset().mockResolvedValue(undefined);
  authState = { state: 'guest', session: { user: { id: 'user-1' } } };
  language = 'ja';
});

describe('WidgetSync', () => {
  it('マウント時に onAppResume を購読する', () => {
    render(<WidgetSync />);
    expect(capturedHandler).toBeDefined();
  });

  it('resume が発火するたびに refreshFeaturedWidget を呼ぶ', () => {
    render(<WidgetSync />);
    refreshFeaturedWidget.mockClear();
    capturedHandler?.();
    capturedHandler?.();
    expect(refreshFeaturedWidget).toHaveBeenCalledTimes(2);
  });

  it('何も描画しない(UI 無し)', () => {
    const { container } = render(<WidgetSync />);
    expect(container).toBeEmptyDOMElement();
  });

  it('アンマウント時に購読を解除する', () => {
    const { unmount } = render(<WidgetSync />);
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('認証準備中は購読も初回更新も行わない', () => {
    authState = { state: 'loading', session: null };
    render(<WidgetSync />);
    expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    expect(capturedHandler).toBeUndefined();
  });

  it('ユーザーと言語が変わると再更新する', () => {
    const view = render(<WidgetSync />);
    refreshFeaturedWidget.mockClear();
    authState = { state: 'authenticated', session: { user: { id: 'user-2' } } };
    language = 'en';
    view.rerender(<WidgetSync />);
    expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
  });
});
