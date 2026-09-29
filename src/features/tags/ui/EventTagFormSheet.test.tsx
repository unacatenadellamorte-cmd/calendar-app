import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventTagFormSheet } from './EventTagFormSheet';

describe('EventTagFormSheet', () => {
  it('24色目のプリセットを選んで保存値へ渡す', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <EventTagFormSheet open editing={null} errorKey={null} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByLabelText('予定名称'), '予定');
    await user.click(screen.getByRole('button', { name: '水浅葱 #06B6D4' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: '予定', color: '#06B6D4' }));
  });

  it('保存済み色が小文字でも対応するプリセットを選択状態にする', () => {
    render(
      <EventTagFormSheet
        open
        editing={{ id: 'tag1', name: '予定', color: '#06b6d4', startLocal: '09:00', endLocal: '18:00' } as never}
        errorKey={null}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.getByRole('button', { name: '水浅葱 #06B6D4' })).toHaveAttribute('aria-pressed', 'true');
  });

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

  it('送信中は自由色入力とプリセットを無効化する', async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onSubmit = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    render(
      <EventTagFormSheet open editing={null} errorKey={null} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByLabelText('ラベル色')).toBeDisabled();
    expect(screen.getByRole('button', { name: '水浅葱 #06B6D4' })).toBeDisabled();
    await act(async () => resolve(true));
  });
});
