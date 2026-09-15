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

const { WidgetSync } = await import('./WidgetSync');

beforeEach(() => {
  unsubscribeMock.mockClear();
  capturedHandler = undefined;
  refreshFeaturedWidget.mockReset().mockResolvedValue(undefined);
});

describe('WidgetSync', () => {
  it('マウント時に onAppResume を購読する', () => {
    render(<WidgetSync />);
    expect(capturedHandler).toBeDefined();
  });

  it('resume が発火するたびに refreshFeaturedWidget を呼ぶ', () => {
    render(<WidgetSync />);
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
});
