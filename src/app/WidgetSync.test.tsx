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

let mediaChange: ((event: MediaQueryListEvent) => void) | undefined;
const removeMediaListener = vi.fn();
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => { mediaChange = handler; },
  removeEventListener: (...args: unknown[]) => removeMediaListener(...args),
}));

const { WidgetSync } = await import('./WidgetSync');

beforeEach(() => {
  unsubscribeMock.mockClear();
  capturedHandler = undefined;
  refreshFeaturedWidget.mockReset().mockResolvedValue(undefined);
  authState = { state: 'guest', session: { user: { id: 'user-1' } } };
  language = 'ja';
  localStorage.clear();
  mediaChange = undefined;
  removeMediaListener.mockClear();
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

  it('テーマ・文字サイズ変更通知でウィジェットを再更新する', () => {
    render(<WidgetSync />);
    refreshFeaturedWidget.mockClear();
    window.dispatchEvent(new Event('calendar-app:widget-appearance-changed'));
    expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
  });

  it('systemテーマのOS変更だけで再更新し、解除時に購読を外す', () => {
    localStorage.setItem('calendar-app.theme', 'system');
    const view = render(<WidgetSync />);
    refreshFeaturedWidget.mockClear();
    mediaChange?.({} as MediaQueryListEvent);
    expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(removeMediaListener).toHaveBeenCalledTimes(1);
  });

  it('固定テーマではOS変更で再更新しない', () => {
    localStorage.setItem('calendar-app.theme', 'dark');
    render(<WidgetSync />);
    refreshFeaturedWidget.mockClear();
    mediaChange?.({} as MediaQueryListEvent);
    expect(refreshFeaturedWidget).not.toHaveBeenCalled();
  });
});
