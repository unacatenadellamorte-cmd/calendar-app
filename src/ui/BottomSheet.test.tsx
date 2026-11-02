import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

const back = vi.hoisted(() => ({ close: null as (() => void) | null, unregister: vi.fn() }));
vi.mock('@/platform/layerBack', () => ({
  registerLayerBack: (close: () => void) => {
    back.close = close;
    return back.unregister;
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('入力レイヤー', () => {
  it('Androidの戻るは画面遷移せず現在の閉じる処理を呼ぶ', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const { rerender, unmount } = render(
      <BottomSheet open title="入力" onClose={vi.fn()}>
        本文
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open title="入力" onClose={close}>
        本文
      </BottomSheet>,
    );
    act(() => back.close?.());
    expect(close).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(180));
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(back.unregister).toHaveBeenCalled();
  });
  it('閉じる操作が重なっても退出後に一度だけ通知する', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    render(
      <BottomSheet open title="入力" onClose={close}>
        本文
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => back.close?.());
    act(() => vi.advanceTimersByTime(179));
    expect(close).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(close).toHaveBeenCalledOnce();
  });
  it('退出中に画面を離れた場合は閉じる通知を残さない', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const { unmount } = render(
      <BottomSheet open title="入力" onClose={close}>
        本文
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(close).not.toHaveBeenCalled();
  });
  it('動きを減らす設定なら退出を待たずに閉じる', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const close = vi.fn();
    render(
      <BottomSheet open title="入力" onClose={close}>
        本文
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(close).toHaveBeenCalledOnce();
  });
  it('つまみを下へ64px以上引くと閉じ、短い移動やキャンセルでは閉じない', () => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', MouseEvent);
    const close = vi.fn();
    render(
      <BottomSheet open title="入力" onClose={close}>
        本文
      </BottomSheet>,
    );
    const handle = screen.getByRole('button', { name: '下にスライドして閉じる' });
    fireEvent.pointerDown(handle, { clientY: 10 });
    fireEvent.pointerMove(handle, { clientY: 30 });
    fireEvent.pointerUp(handle, { clientY: 30 });
    fireEvent.click(handle);
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { clientY: 10 });
    fireEvent.pointerCancel(handle);
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { clientY: 10 });
    fireEvent.pointerMove(handle, { clientY: 110 });
    fireEvent.pointerUp(handle, { clientY: 110 });
    fireEvent.click(handle);
    expect(close).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(180));
    expect(close).toHaveBeenCalledOnce();
  });
  it('dismissible=falseなら保存中の閉鎖操作を無視する', () => {
    const close = vi.fn();
    render(
      <BottomSheet open title="入力" onClose={close} dismissible={false}>
        本文
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    act(() => back.close?.());
    expect(close).not.toHaveBeenCalled();
  });
  it('本文を端末幅に拘束し、横スクロールと横パンを許可しない', () => {
    render(
      <BottomSheet open title="入力" onClose={vi.fn()}>
        <div data-testid="wide-content" style={{ width: '600px' }} />
      </BottomSheet>,
    );
    const panel = screen.getByRole('dialog');
    const content = screen.getByTestId('wide-content').parentElement;
    expect(panel).toHaveClass('min-w-0', 'max-w-2xl', 'overflow-x-hidden');
    expect(content).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-x-hidden');
  });
});
