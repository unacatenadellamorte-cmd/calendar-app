import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassTransparencyControls } from './GlassTransparencyControls';
import { WIDGET_APPEARANCE_CHANGED } from '@/platform/widgetAppearanceEvents';
import { buildWidgetAppearance } from '@/platform/widgetAppearance';

describe('GlassTransparencyControls', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('2つのスライダーを既定値・ラベル付きで表示する', () => {
    render(<GlassTransparencyControls />);
    const app = screen.getByRole('slider', { name: 'アプリの透過度' });
    const widget = screen.getByRole('slider', { name: 'ウィジェットの透過度' });
    expect(app).toHaveValue('70');
    expect(widget).toHaveValue('35');
    expect(app).toHaveAttribute('aria-valuetext', '70%');
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--glass-clear')).toBe('0.7');
  });

  it('アプリ: 操作中に即時CSS反映し、保存して再表示でも保持する', () => {
    const { unmount } = render(<GlassTransparencyControls />);
    const app = screen.getByRole('slider', { name: 'アプリの透過度' });
    for (const value of ['0', '50', '100']) {
      fireEvent.change(app, { target: { value } });
      expect(document.documentElement.style.getPropertyValue('--glass-clear')).toBe(String(Number(value) / 100));
      expect(localStorage.getItem('calendar-app.glass-app-transparency')).toBe(value);
    }
    unmount();
    render(<GlassTransparencyControls />);
    expect(screen.getByRole('slider', { name: 'アプリの透過度' })).toHaveValue('100');
  });

  it('ウィジェット: 操作が止まってから一度だけ更新を通知し、ペイロードへ反映する', () => {
    const listener = vi.fn();
    window.addEventListener(WIDGET_APPEARANCE_CHANGED, listener);
    render(<GlassTransparencyControls />);
    const widget = screen.getByRole('slider', { name: 'ウィジェットの透過度' });
    fireEvent.change(widget, { target: { value: '10' } });
    fireEvent.change(widget, { target: { value: '60' } });
    expect(listener).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(buildWidgetAppearance('glass').widgetTransparency).toBe(60);
    window.removeEventListener(WIDGET_APPEARANCE_CHANGED, listener);
  });

  it('キーボードの矢印で1%ずつ変えられる(ネイティブrange)', () => {
    render(<GlassTransparencyControls />);
    const app = screen.getByRole('slider', { name: 'アプリの透過度' });
    expect(app).toHaveAttribute('type', 'range');
    expect(app).toHaveAttribute('step', '1');
    expect(app).toHaveAttribute('min', '0');
    expect(app).toHaveAttribute('max', '100');
  });
});
