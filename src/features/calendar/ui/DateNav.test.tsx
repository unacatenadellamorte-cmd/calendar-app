import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateNav } from './DateNav';

function setup(view: 'month' | 'week' | 'list' | 'year' = 'month') {
  const fns = {
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onJump: vi.fn(),
  };
  render(<DateNav view={view} cursor="2026-09-08" {...fns} />);
  return fns;
}

describe('DateNav', () => {
  it('month は月見出し「2026年9月」', () => {
    setup('month');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('2026年9月');
  });

  it('week は日付見出し「9月8日(火)」', () => {
    setup('week');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('9月8日(火)');
  });

  it('year は年見出し「2026年」', () => {
    setup('year');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('2026年');
  });

  it('month/week は前後ボタンを出し、list は出さない', () => {
    const { rerender } = render(
      <DateNav
        view="month"
        cursor="2026-09-08"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToday={vi.fn()}
        onJump={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '前へ' })).toBeInTheDocument();

    rerender(
      <DateNav
        view="list"
        cursor="2026-09-08"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToday={vi.fn()}
        onJump={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '前へ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
  });

  it('前へ / 次へ / 今日 のボタンがコールバックを呼ぶ', async () => {
    const user = userEvent.setup();
    const { onPrev, onNext, onToday } = setup('month');
    await user.click(screen.getByRole('button', { name: '前へ' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '今日' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('見出しをタップすると日付ジャンプ入力が出て、変更で onJump を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onJump } = setup('month');
    expect(screen.queryByLabelText('日付を移動')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2026年9月' }));
    const input = screen.getByLabelText('日付を移動');
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    expect(onJump).toHaveBeenCalledWith('2026-12-25');
  });
});
