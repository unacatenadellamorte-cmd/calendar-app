import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShiftTemplate } from '@/data/shift-templates';
import { ShiftTemplateFormSheet } from './ShiftTemplateFormSheet';

const base = {
  usedColors: [],
  errorKey: null,
  onClose: vi.fn(),
  onDelete: vi.fn(),
};

describe('ShiftTemplateFormSheet', () => {
  it('入力を集めて onSubmit を呼ぶ', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<ShiftTemplateFormSheet open editing={null} {...base} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('シフト名'), '平日');
    await user.clear(screen.getByLabelText('時給(円)'));
    await user.type(screen.getByLabelText('時給(円)'), '1100');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '平日', hourlyWage: 1100, startLocal: '09:00', endLocal: '18:00' }),
    );
  });

  it('errorKey があるとシート内にエラー文言を出す', () => {
    render(
      <ShiftTemplateFormSheet
        open
        editing={null}
        {...base}
        errorKey="shift-template/invalid-break"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('休憩');
  });

  it('編集時は既存値をプリセットし、削除ボタンを出す', () => {
    const editing: ShiftTemplate = {
      id: 't1', name: '早番', startLocal: '08:00', endLocal: '16:00',
      breakMinutes: 45, hourlyWage: 1200, workplaceLabel: 'カフェ', color: '#0072B2',
      createdAt: '', updatedAt: '',
    };
    render(<ShiftTemplateFormSheet open editing={editing} {...base} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('シフト名')).toHaveValue('早番');
    expect(screen.getByLabelText('勤務先ラベル(任意)')).toHaveValue('カフェ');
    expect(screen.getByRole('button', { name: 'このお気に入りシフトを削除' })).toBeInTheDocument();
  });

  it('一覧の再取得で usedColors の配列が変わっても入力中の値を保持する', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    const view = render(<ShiftTemplateFormSheet open editing={null} {...base} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('シフト名'), '平日');
    await user.clear(screen.getByLabelText('休憩(分)'));
    await user.type(screen.getByLabelText('休憩(分)'), '45');
    view.rerender(<ShiftTemplateFormSheet open editing={null} {...base} usedColors={['#C6413B']} onSubmit={onSubmit} />);
    expect(screen.getByLabelText('シフト名')).toHaveValue('平日');
    expect(screen.getByLabelText('休憩(分)')).toHaveValue(45);
  });
});
