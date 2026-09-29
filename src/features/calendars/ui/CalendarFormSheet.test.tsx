import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarFormSheet } from './CalendarFormSheet';

describe('CalendarFormSheet', () => {
  it('24色目のプリセットを選んで保存値へ渡す', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <CalendarFormSheet open editing={null} usedColors={[]} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByLabelText('名前'), '予定');
    await user.click(screen.getByRole('button', { name: '水浅葱' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: '予定', color: '#06B6D4' });
  });

  it('保存済み色が小文字でも対応するプリセットを選択状態にする', () => {
    render(
      <CalendarFormSheet
        open
        editing={{ id: 'c1', name: '予定', color: '#06b6d4', isShift: false } as never}
        usedColors={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.getByRole('button', { name: '水浅葱' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('一覧の再取得で usedColors の配列が変わっても入力中の名前を保持する', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    const view = render(
      <CalendarFormSheet
        open
        editing={null}
        usedColors={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText('名前'), '個人');
    await user.click(screen.getByRole('button', { name: '朱' }));
    view.rerender(
      <CalendarFormSheet
        open
        editing={null}
        usedColors={['#C6413B']}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText('名前')).toHaveValue('個人');
  });
});
