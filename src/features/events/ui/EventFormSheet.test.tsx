import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Calendar } from '@/data/calendars';
import { EventFormSheet } from './EventFormSheet';

const calendars: Calendar[] = [
  {
    id: 'c1',
    name: '仕事',
    color: '#0072B2',
    source: 'local',
    isShift: false,
    isVisible: true,
    createdAt: '',
    updatedAt: '',
  },
];

function setup(overrides: Partial<Parameters<typeof EventFormSheet>[0]> = {}) {
  const onCreate = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(
    <EventFormSheet
      open
      editing={null}
      calendars={calendars}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
      {...overrides}
    />,
  );
  return { onCreate, onUpdate, onClose };
}

describe('EventFormSheet', () => {
  it('空タイトルでは保存せずバリデーションメッセージを出す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('タイトルを入力');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('開始 > 終了 では保存せず「終了は開始より後に」を出す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '打合せ');
    const [start, end] = screen.getAllByLabelText(/開始|終了/);
    await user.clear(start!);
    await user.type(start!, '2026-09-08T15:00');
    await user.clear(end!);
    await user.type(end!, '2026-09-08T14:00');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('終了は開始より後に');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('終日で日付未入力なら「日付を選んで」を出す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '祝日');
    await user.click(screen.getByRole('checkbox', { name: '終日' }));
    await user.clear(screen.getByLabelText('日付'));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('日付を選んで');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('正しい入力で onCreate を呼び、UTC ISO で渡す', async () => {
    const user = userEvent.setup();
    const { onCreate, onClose } = setup();
    await user.type(screen.getByLabelText('タイトル'), '打合せ');
    const start = screen.getByLabelText('開始');
    const end = screen.getByLabelText('終了');
    await user.clear(start);
    await user.type(start, '2026-09-08T14:00');
    await user.clear(end);
    await user.type(end, '2026-09-08T15:00');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const arg = onCreate.mock.calls[0]![0];
    expect(arg).toMatchObject({ calendarId: 'c1', title: '打合せ', allDay: false });
    expect(arg.startsAt).toMatch(/^2026-09-08T\d{2}:00:00/); // UTC ISO
    expect(new Date(arg.startsAt).getTime()).toBeLessThan(new Date(arg.endsAt).getTime());
    expect(onClose).toHaveBeenCalled();
  });
});
