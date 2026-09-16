import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { PayCard } from './PayCard';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T03:00:00Z'));
});
afterAll(() => vi.useRealTimers());

const shiftCal: Calendar = {
  id: 'shift',
  name: 'シフト',
  color: '#009E73',
  source: 'local',
  isShift: true,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
};

const shiftEvent = (over: Partial<EventItem> = {}): EventItem => ({
  id: 's1',
  calendarId: 'shift',
  title: '平日',
  allDay: false,
  startsAt: '2026-09-08T00:00:00Z',
  endsAt: '2026-09-08T08:00:00Z',
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

describe('PayCard', () => {
  it('当月の給料見込みと件数を表示する', () => {
    render(<PayCard events={[shiftEvent({ id: 'a' }), shiftEvent({ id: 'b' })]} calendars={[shiftCal]} />);
    expect(screen.getByText('¥15,400')).toBeInTheDocument();
    expect(screen.getByText('9月 ・ 2件のシフト')).toBeInTheDocument();
  });

  it('シフト0件は ¥0 と静かな文言', () => {
    render(<PayCard events={[]} calendars={[shiftCal]} />);
    expect(screen.getByText('¥0')).toBeInTheDocument();
    expect(screen.getByText('9月のシフトはまだありません')).toBeInTheDocument();
    expect(screen.queryByText(/!|!/)).not.toBeInTheDocument();
  });

  it('前の月の矢印で対象月が変わる', async () => {
    const user = userEvent.setup();
    render(<PayCard events={[shiftEvent()]} calendars={[shiftCal]} />);
    await user.click(screen.getByRole('button', { name: '前の月' }));
    expect(screen.getByText('8月の給料見込み')).toBeInTheDocument();
  });

  it('カード本体をタップすると内訳シートが開く', async () => {
    const user = userEvent.setup();
    render(<PayCard events={[shiftEvent()]} calendars={[shiftCal]} />);
    await user.click(screen.getByText('¥7,700'));
    expect(screen.getByRole('dialog', { name: '9月の給料見込み' })).toBeInTheDocument();
  });
});
