import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdBanner } from './AdBanner';

const sdk = vi.hoisted(() => ({ supported: true, place: vi.fn(), stop: vi.fn() }));
vi.mock('@/platform/appLifecycle', () => ({ onAppResume: () => () => undefined }));
vi.mock('@/platform/ads', () => ({
  adsSupported: () => sdk.supported, placeBanner: sdk.place, stopBanner: sdk.stop,
}));
beforeEach(() => {
  sdk.supported = true;
  sdk.place.mockClear(); sdk.stop.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
function Tabs({ secret = false }: { secret?: boolean }) {
  return <><nav className="app-bottom-tabs" style={{ paddingBottom: 20 }} data-secret={secret} /><AdBanner /></>;
}
describe('下タブと広告の連動', () => {
  it('Webでは呼び出さず、下タブがない画面でも表示しない', () => {
    sdk.supported = false;
    const first = render(<Tabs />);
    expect(sdk.place).not.toHaveBeenCalled();
    first.unmount(); sdk.supported = true;
    render(<AdBanner />);
    expect(sdk.place).not.toHaveBeenCalled();
  });
  it('シークレット変更は配信を再要求せず、破棄で停止する', () => {
    const view = render(<Tabs />);
    expect(sdk.place).toHaveBeenCalledTimes(1);
    view.rerender(<Tabs secret />);
    expect(sdk.place).toHaveBeenCalledTimes(1);
    view.unmount(); expect(sdk.stop).toHaveBeenCalledTimes(1);
  });
  it('ダイアログの開閉に追従して広告を隠し、復帰する', async () => {
    render(<Tabs />);
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    act(() => document.body.append(dialog));
    await waitFor(() => expect(sdk.place).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), true));
    act(() => dialog.remove());
    await waitFor(() => expect(sdk.place).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), false));
  });
  it('タブ本体の高さを渡し、リサイズと通信復旧で再配置する', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 78 } as DOMRect);
    const view = render(<Tabs />);
    expect(sdk.place).toHaveBeenLastCalledWith(58, window.innerWidth, false);
    rect.mockReturnValue({ height: 90 } as DOMRect);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(sdk.place).toHaveBeenLastCalledWith(70, window.innerWidth, false);
    sdk.place.mockClear();
    act(() => window.dispatchEvent(new Event('online')));
    expect(sdk.place).toHaveBeenCalledTimes(1);
    view.unmount(); rect.mockRestore();
  });
});
