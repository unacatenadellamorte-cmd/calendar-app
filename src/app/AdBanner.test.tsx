import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdBanner } from './AdBanner';

const sdk = vi.hoisted(() => ({ supported: true, place: vi.fn(), stop: vi.fn(), height: 0 }));
vi.mock('@/platform/appLifecycle', () => ({ onAppResume: () => () => undefined }));
vi.mock('@/platform/ads', () => ({
  adsSupported: () => sdk.supported, placeBanner: sdk.place, stopBanner: sdk.stop,
  useAdsState: () => ({ height: sdk.height }),
}));
let top = 112;
let width = 344;
let left = 8;
beforeEach(() => {
  sdk.supported = true; sdk.height = 0; top = 112; width = 344; left = 8;
  sdk.place.mockClear(); sdk.stop.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this.classList.contains('calendar-ad-slot')) return { top, left, right: left + width, width, height: sdk.height > 0 ? sdk.height + 16 : 0, bottom: top + (sdk.height > 0 ? sdk.height + 16 : 0) } as DOMRect;
    return { top: 0, left: 0, right: 360, width: 360, height: 700, bottom: 700 } as DOMRect;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('カレンダー上部の広告枠', () => {
  it('Web/iOSでは枠もAPI呼出しも追加しない', () => {
    sdk.supported = false;
    const view = render(<AdBanner />);
    expect(view.container).toBeEmptyDOMElement();
    expect(sdk.place).not.toHaveBeenCalled();
  });
  it('安全領域込みのDOM上端を二重加算せず、専用枠の幅を渡す', () => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '32px');
    const view = render(<main><AdBanner /></main>);
    expect(sdk.place).toHaveBeenLastCalledWith({ margin: 112, left: 8, width: 344, height: 0, visible: true }, false);
    expect(view.container.querySelector('.calendar-ad-slot')).toHaveStyle({ height: '0px' });
    document.documentElement.style.removeProperty('--safe-area-inset-top');
  });
  it('SDKの高さをDOMに反映したあとで確保済みの高さを通知する', () => {
    const view = render(<AdBanner />);
    sdk.height = 60;
    view.rerender(<AdBanner />);
    expect(view.container.firstChild).toHaveStyle({ height: '76px' });
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ margin: 120, height: 60 }), false);
    sdk.height = 0;
    view.rerender(<AdBanner />);
    expect(view.container.firstChild).toHaveStyle({ height: '0px' });
  });
  it('ダイアログの開閉に追従して広告を隠し、復帰する', async () => {
    render(<AdBanner />);
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    act(() => document.body.append(dialog));
    await waitFor(() => expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false));
    act(() => dialog.remove());
    await waitFor(() => expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }), false));
  });
  it('内側のスクロールに追従し、上端が見切れたら非表示にする', () => {
    const view = render(<main><AdBanner /></main>);
    top = 50;
    act(() => view.container.querySelector('main')!.dispatchEvent(new Event('scroll')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ margin: 50, visible: true }), false);
    top = -1;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false);
  });
  it('キーボードと下端の見切れは非表示、幅変更は新しい枠幅を渡す', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 700, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    sdk.height = 60;
    render(<AdBanner />);
    Object.assign(viewport, { height: 350 });
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false);
    Object.assign(viewport, { height: window.innerHeight });
    top = window.innerHeight - 30;
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false);
    top = 112; width = 600;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ width: 600, visible: true }), false);
  });
  it('通信復旧は明示再試行、破棄後はリスナーから再表示しない', () => {
    const view = render(<AdBanner />);
    act(() => window.dispatchEvent(new Event('online')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.any(Object), true);
    view.unmount();
    expect(sdk.stop).toHaveBeenCalledTimes(1);
    sdk.place.mockClear();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(sdk.place).not.toHaveBeenCalled();
  });
  it('横方向にはみ出した枠は表示しない', () => {
    render(<main><AdBanner /></main>);
    left = -1;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false);
    left = 20;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false);
  });
  it('WebViewと画面が同時に縮む場合も入力フォーカス中は隠す', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 350, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('innerHeight', 350);
    const view = render(<><AdBanner /><input aria-label="予定名" /></>);
    act(() => view.getByLabelText('予定名').focus());
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }), false);
    act(() => view.getByLabelText('予定名').blur());
    expect(sdk.place).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }), false);
  });
});
