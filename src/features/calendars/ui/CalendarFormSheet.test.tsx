import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarFormSheet } from './CalendarFormSheet';

describe('CalendarFormSheet', () => {
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
