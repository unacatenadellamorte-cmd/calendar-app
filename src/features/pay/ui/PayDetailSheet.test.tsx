import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EventItem } from '@/data/events';
import { PayDetailSheet } from './PayDetailSheet';

const shiftEvent = (over: Partial<EventItem> = {}): EventItem => ({
  id: 's1',
  calendarId: 'shift',
  title: '平日',
  allDay: false,
  startsAt: '2026-09-08T00:00:00Z', // 09:00 JST
  endsAt: '2026-09-08T08:00:00Z', // 17:00 JST
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: 60,
  hourlyWage: 1100,
  workplaceLabel: null,
  shiftTemplateId: 't1',
  reminderMinutes: null,
  isSecret: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('PayDetailSheet', () => {
  it('その月のシフト明細と合計を出す', () => {
    render(
      <PayDetailSheet
        open
        monthLabel="9月"
        amount={7700}
        shifts={[shiftEvent()]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '9月の給料見込み' })).toBeInTheDocument();
    // 実働7.0h × ¥1,100 = ¥7,700
    expect(screen.getByText(/7\.0h × ¥1,100 = ¥7,700/)).toBeInTheDocument();
    expect(screen.getByText('合計')).toBeInTheDocument();
  });

  it('シフト0件なら案内文', () => {
    render(
      <PayDetailSheet open monthLabel="10月" amount={0} shifts={[]} onClose={vi.fn()} />,
    );
    expect(screen.getByText('10月のシフトはまだありません。')).toBeInTheDocument();
  });
});
