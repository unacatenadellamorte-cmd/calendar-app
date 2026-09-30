import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShiftTemplate } from '@/data/shift-templates';
import { ShiftTemplateChip } from './ShiftTemplateChip';

const tpl: ShiftTemplate = {
  allDay: false,
  id: 't1',
  name: '平日',
  startLocal: '17:00',
  endLocal: '22:00',
  breakMinutes: 30,
  hourlyWage: 1100,
  workplaceLabel: null,
  color: '#009E73',
  createdAt: '',
  updatedAt: '',
};

describe('ShiftTemplateChip', () => {
  it('シフト名と時間帯を表示する', () => {
    render(<ShiftTemplateChip template={tpl} onTap={vi.fn()} />);
    const chip = screen.getByRole('button');
    expect(chip).toHaveTextContent('平日');
    expect(chip).toHaveTextContent('17:00–22:00');
  });

  it('タップで onTap(そのテンプレ) を呼ぶ', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    render(<ShiftTemplateChip template={tpl} onTap={onTap} />);
    await user.click(screen.getByRole('button'));
    expect(onTap).toHaveBeenCalledWith(tpl);
  });
});


it('終日のシフトは時間帯の代わりに終日を表示する', () => {
  render(<ShiftTemplateChip template={{ ...tpl, allDay: true }} onTap={vi.fn()} />);
  expect(screen.getByRole('button')).toHaveTextContent('終日');
  expect(screen.getByRole('button')).not.toHaveTextContent('17:00');
});
