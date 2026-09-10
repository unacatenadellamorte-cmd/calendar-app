import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Calendar } from '@/data/calendars';
import { CalendarRow } from './CalendarRow';

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

function setup(over: Partial<Parameters<typeof CalendarRow>[0]> = {}) {
  const props = {
    calendar: cal(),
    rank: 2,
    total: 5,
    onEdit: vi.fn(),
    onToggleVisible: vi.fn(),
    onMove: vi.fn(),
    onDragStartRow: vi.fn(),
    onDropRow: vi.fn(),
    dragging: false,
    ...over,
  };
  render(
    <ul>
      <CalendarRow {...props} />
    </ul>,
  );
  return props;
}

describe('CalendarRow', () => {
  it('順位番号と「優先度 rank/total」を出す', () => {
    setup({ rank: 2, total: 5 });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/優先度 2\/5/)).toBeInTheDocument();
  });

  it('▲▼ が方向つきで onMove を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onMove, calendar } = setup({ rank: 2, total: 5 });
    await user.click(screen.getByRole('button', { name: '「仕事」を上へ' }));
    expect(onMove).toHaveBeenCalledWith(calendar, 'up');
    await user.click(screen.getByRole('button', { name: '「仕事」を下へ' }));
    expect(onMove).toHaveBeenCalledWith(calendar, 'down');
  });

  it('先頭は ▲ 無効、末尾は ▼ 無効', () => {
    setup({ rank: 1, total: 3 });
    expect(screen.getByRole('button', { name: '「仕事」を上へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '「仕事」を下へ' })).toBeEnabled();
  });

  it('末尾行は ▼ 無効', () => {
    setup({ rank: 3, total: 3 });
    expect(screen.getByRole('button', { name: '「仕事」を下へ' })).toBeDisabled();
  });

  it('表示トグルが onToggleVisible を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onToggleVisible, calendar } = setup();
    await user.click(screen.getByRole('checkbox'));
    expect(onToggleVisible).toHaveBeenCalledWith(calendar);
  });

  it('google 行 + syncError: 「取り込めませんでした」+「再試行」を出し、onRetry を呼ぶ', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    setup({ calendar: cal({ source: 'google', name: 'ゴミ' }), syncError: 'sync-failed', onRetry });
    expect(screen.getByText('取り込めませんでした')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('retrying 中は再試行ボタンが無効', () => {
    setup({
      calendar: cal({ source: 'google' }),
      syncError: 'sync-failed',
      onRetry: vi.fn(),
      retrying: true,
    });
    expect(screen.getByRole('button', { name: '取り込み中…' })).toBeDisabled();
  });

  it('local 行は syncError があっても失敗表示を出さない', () => {
    setup({ calendar: cal({ source: 'local' }), syncError: 'sync-failed', onRetry: vi.fn() });
    expect(screen.queryByText('取り込めませんでした')).not.toBeInTheDocument();
  });

  it('syncError なしなら失敗行は出ない', () => {
    setup({ calendar: cal({ source: 'google' }), syncError: null });
    expect(screen.queryByText('取り込めませんでした')).not.toBeInTheDocument();
  });
});
