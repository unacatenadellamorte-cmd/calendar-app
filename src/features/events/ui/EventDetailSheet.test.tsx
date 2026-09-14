import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { EventDetailSheet } from './EventDetailSheet';

const baseEvent: EventItem = {
  id: 'e1',
  calendarId: 'g1',
  title: 'ゴミ収集(可燃)',
  allDay: true,
  startsAt: null,
  endsAt: null,
  eventDate: '2026-09-15',
  note: null,
  source: 'google',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
  createdAt: 'x',
  updatedAt: 'x',
};

const calendar: Calendar = {
  id: 'g1',
  name: 'ゴミ収集日',
  color: '#B99AFF',
  source: 'google',
  isShift: false,
  isVisible: true,
  priority: 3,
  createdAt: 'x',
  updatedAt: 'x',
};

describe('EventDetailSheet', () => {
  it('event が null なら何も出さない', () => {
    render(
      <EventDetailSheet
        event={null}
        calendar={undefined}
        onClose={vi.fn()}
        onSetReminder={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('タイトル・日付・カレンダー名を出す(終日)', () => {
    render(
      <EventDetailSheet
        event={baseEvent}
        calendar={calendar}
        onClose={vi.fn()}
        onSetReminder={vi.fn()}
      />,
    );
    expect(screen.getByText('ゴミ収集(可燃)')).toBeInTheDocument();
    expect(screen.getByText('9/15 終日')).toBeInTheDocument();
    expect(screen.getByText('ゴミ収集日')).toBeInTheDocument();
  });

  it('時刻付きは開始〜終了、メモがあれば出す', () => {
    render(
      <EventDetailSheet
        event={{
          ...baseEvent,
          allDay: false,
          eventDate: null,
          startsAt: '2026-09-15T01:00:00.000Z',
          endsAt: '2026-09-15T02:00:00.000Z',
          note: '燃えるゴミの日',
        }}
        calendar={calendar}
        onClose={vi.fn()}
        onSetReminder={vi.fn()}
      />,
    );
    expect(screen.getByText(/〜/)).toBeInTheDocument();
    expect(screen.getByText('燃えるゴミの日')).toBeInTheDocument();
  });

  it('編集・削除ボタンを出さない。読み取り専用の注記を出す(Google)', () => {
    render(
      <EventDetailSheet
        event={baseEvent}
        calendar={calendar}
        onClose={vi.fn()}
        onSetReminder={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /編集|削除|保存/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('この予定は Google カレンダーから取り込んだものです。編集はできません。'),
    ).toBeInTheDocument();
  });

  it('source=device なら端末カレンダー由来の注記を出す(Story 5.3)', () => {
    render(
      <EventDetailSheet
        event={{ ...baseEvent, source: 'device' }}
        calendar={{ ...calendar, source: 'device' }}
        onClose={vi.fn()}
        onSetReminder={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /編集|削除|保存/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('この予定は端末のカレンダーから取り込んだものです。編集はできません。'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('この予定は Google カレンダーから取り込んだものです。編集はできません。'),
    ).not.toBeInTheDocument();
  });

  it('Escape で onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <EventDetailSheet
        event={baseEvent}
        calendar={calendar}
        onClose={onClose}
        onSetReminder={vi.fn()}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('終日でなければ ReminderPicker(リマインダー)を表示する', () => {
    const onSetReminder = vi.fn().mockResolvedValue(true);
    render(
      <EventDetailSheet
        event={{ ...baseEvent, allDay: false, eventDate: null, startsAt: '2026-09-15T01:00:00.000Z', endsAt: '2026-09-15T02:00:00.000Z' }}
        calendar={calendar}
        onClose={vi.fn()}
        onSetReminder={onSetReminder}
      />,
    );
    expect(screen.getByText('リマインダー')).toBeInTheDocument();
  });

  it('終日予定は ReminderPicker を表示しない', () => {
    render(
      <EventDetailSheet
        event={baseEvent}
        calendar={calendar}
        onClose={vi.fn()}
        onSetReminder={vi.fn()}
      />,
    );
    expect(screen.queryByText('リマインダー')).not.toBeInTheDocument();
  });
});
