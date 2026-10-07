import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EVENT_STAMPS } from '@/lib/event-stamps';
import { StampPicker } from './StampPicker';

describe('StampPicker', () => {
  it('32種を選択でき、解除するとnullを返す', () => {
    const onChange = vi.fn();
    render(<StampPicker value={null} color="#2563EB" onChange={onChange} />);
    expect(EVENT_STAMPS).toHaveLength(32);
    expect(
      screen.getByRole('group', { name: 'スタンプを選択' }).querySelectorAll('button'),
    ).toHaveLength(33);
    fireEvent.click(screen.getByRole('button', { name: '学校' }));
    expect(onChange).toHaveBeenLastCalledWith('school');
    fireEvent.click(screen.getByRole('button', { name: 'スタンプなし' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
