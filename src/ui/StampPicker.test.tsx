import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EVENT_STAMPS } from '@/lib/event-stamps';
import { StampPicker } from './StampPicker';

describe('StampPicker', () => {
  it('32種を選択でき、解除するとnullを返す', () => {
    const onChange = vi.fn();
    render(<StampPicker value={null} onChange={onChange} />);
    expect(EVENT_STAMPS).toHaveLength(32);
    expect(
      screen.getByRole('group', { name: 'スタンプを選択' }).querySelectorAll('button'),
    ).toHaveLength(33);
    fireEvent.click(screen.getByRole('button', { name: '学校' }));
    expect(onChange).toHaveBeenLastCalledWith('school');
    fireEvent.click(screen.getByRole('button', { name: 'スタンプなし' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('折りたたみ時は＋だけで一覧を開き、選択値を変えずに再び閉じられる', () => {
    const onChange = vi.fn();
    render(<StampPicker collapsible value="work" onChange={onChange} />);
    const toggle = screen.getByRole('button', { name: 'スタンプを選択' });
    expect(toggle).toHaveTextContent('＋');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'スタンプを選択' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '仕事' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '学校' }));
    expect(onChange).toHaveBeenLastCalledWith('school');
    fireEvent.click(toggle);
    expect(screen.queryByRole('group', { name: 'スタンプを選択' })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('無効なフォームでは＋から一覧を開かない', () => {
    render(<StampPicker collapsible disabled value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'スタンプを選択' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'スタンプを選択' })).not.toBeInTheDocument();
  });
});
