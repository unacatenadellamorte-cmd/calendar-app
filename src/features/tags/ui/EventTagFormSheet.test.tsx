import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventTagFormSheet } from './EventTagFormSheet';

describe('EventTagFormSheet', () => {
  it('保存値を渡し、連打中は送信を一度に抑える', async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    render(
      <EventTagFormSheet
        open
        editing={null}
        errorKey={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText('予定名称'), '仕事');
    const button = screen.getByRole('button', { name: '保存' });
    await user.click(button);
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => resolve(true));
  });
});
