import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventTagFormSheet } from './EventTagFormSheet';

describe('EventTagFormSheet', () => {
  it('24色目のプリセットを選んで保存値へ渡す', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <EventTagFormSheet
        open
        editing={null}
        errorKey={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText('予定名称'), '予定');
    await user.click(screen.getByRole('button', { name: '水浅葱 #06B6D4' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: '予定', color: '#06B6D4' }),
    );
  });

  it('保存済み色が小文字でも対応するプリセットを選択状態にする', () => {
    render(
      <EventTagFormSheet
        open
        editing={
          {
            id: 'tag1',
            name: '予定',
            color: '#06b6d4',
            startLocal: '09:00',
            endLocal: '18:00',
          } as never
        }
        errorKey={null}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(screen.getByRole('button', { name: '水浅葱 #06B6D4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByLabelText('ラベル色')).toBeDisabled();
    expect(screen.getByRole('button', { name: '水浅葱 #06B6D4' })).toBeDisabled();
    await act(async () => resolve(true));
  });
});

it('終日を作成し、切替途中の時刻を保持して、不正な非表示項目も保存できる', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(false);
  render(
    <EventTagFormSheet
      open
      editing={null}
      errorKey={null}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  await user.type(screen.getByLabelText('予定名称'), '休み');
  fireEvent.change(screen.getByLabelText('開始'), { target: { value: '22:00' } });
  fireEvent.change(screen.getByLabelText('終了'), { target: { value: '06:00' } });
  await user.click(screen.getByLabelText('終日'));
  expect(screen.queryByLabelText('開始')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('終日'));
  expect(screen.getByLabelText('開始')).toHaveValue('22:00');
  expect(screen.getByLabelText('終了')).toHaveValue('06:00');
  fireEvent.change(screen.getByLabelText('開始'), { target: { value: '' } });
  await user.click(screen.getByLabelText('終日'));
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ allDay: true, startLocal: '09:00', endLocal: '18:00' }),
  );
});

it('保存済みの終日を編集するとチェック済みで時刻入力を隠す', async () => {
  const onSubmit = vi.fn().mockResolvedValue(true);
  const editing = {
    allDay: true,
    id: 'holiday',
    name: '休み',
    color: '#009E73',
    startLocal: '09:00',
    endLocal: '18:00',
    createdAt: '',
    updatedAt: '',
  };
  render(
    <EventTagFormSheet
      open
      editing={editing}
      errorKey={null}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  expect(screen.getByLabelText('終日')).toBeChecked();
  expect(screen.queryByLabelText('開始')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '保存' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allDay: true }));
});
