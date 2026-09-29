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
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(back.unregister).toHaveBeenCalled();
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
});
