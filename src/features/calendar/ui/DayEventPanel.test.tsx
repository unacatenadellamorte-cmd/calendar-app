import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { groupEventsByDay, makePriorityOf } from '@/lib/calendar-view';
import { DayEventPanel } from './DayEventPanel';

const calendar: Calendar = {
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
};
const calendarById = new Map([['c1', calendar]]);

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '会議',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
  isSecret: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

function toByDay(events: EventItem[], byCalendar = calendarById) {
  return groupEventsByDay(events, makePriorityOf(byCalendar));
}

describe('DayEventPanel', () => {
  it('見出しにその日のタイトルを出す', () => {
    render(
      <DayEventPanel
        date="2026-09-08"
        byDay={toByDay([])}
        calendarById={calendarById}
        onEventTap={vi.fn()}
        onAddEvent={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '9月8日(火)' })).toBeInTheDocument();
  });

  it('予定が無ければ「予定はありません」', () => {
    render(
      <DayEventPanel
        date="2026-09-08"
        byDay={toByDay([])}
        calendarById={calendarById}
        onEventTap={vi.fn()}
        onAddEvent={vi.fn()}
      />,
    );
    expect(screen.getByText('予定はありません')).toBeInTheDocument();
  });

  it('その日の予定だけを一覧表示し、他の日の予定は出さない', () => {
    const target = ev({ id: 'x', title: '役員会議' });
    const other = ev({
      id: 'y',
      title: '別日の予定',
      startsAt: '2026-09-09T01:00:00Z',
      endsAt: '2026-09-09T02:00:00Z',
    });
    render(
      <DayEventPanel
        date="2026-09-08"
        byDay={toByDay([target, other])}
        calendarById={calendarById}
        onEventTap={vi.fn()}
        onAddEvent={vi.fn()}
      />,
    );
    expect(screen.getByText('役員会議')).toBeInTheDocument();
    expect(screen.queryByText('別日の予定')).not.toBeInTheDocument();
  });

  it('予定をタップすると onEventTap(その予定) を呼ぶ', async () => {
    const user = userEvent.setup();
    const onEventTap = vi.fn();
    const target = ev({ id: 'x', title: '役員会議' });
    render(
      <DayEventPanel
        date="2026-09-08"
        byDay={toByDay([target])}
        calendarById={calendarById}
        onEventTap={onEventTap}
        onAddEvent={vi.fn()}
      />,
    );
    await user.click(screen.getByText('役員会議'));
    expect(onEventTap).toHaveBeenCalledWith(target);
  });

  it('同日複数件は優先度の高いカレンダーの予定から先に並ぶ', () => {
    const lowCalendar: Calendar = { ...calendar, id: 'c2', name: '低優先', priority: 1 };
    const twoCals = new Map([
      ['c1', calendar],
      ['c2', lowCalendar],
    ]);
    const low = ev({
      id: 'lo',
      title: '低優先の予定',
      calendarId: 'c2',
      startsAt: '2026-09-08T00:00:00Z',
      endsAt: '2026-09-08T01:00:00Z',
    });
    const high = ev({
      id: 'hi',
      title: '高優先の予定',
      calendarId: 'c1',
      startsAt: '2026-09-08T05:00:00Z',
      endsAt: '2026-09-08T06:00:00Z',
    });
    render(
      <DayEventPanel
        date="2026-09-08"
        byDay={toByDay([low, high], twoCals)}
        calendarById={twoCals}
        onEventTap={vi.fn()}
        onAddEvent={vi.fn()}
      />,
    );
    const titles = screen.getAllByText(/優先の予定/).map((el) => el.textContent);
    expect(titles).toEqual(['高優先の予定', '低優先の予定']);
  });

  it('「＋ この日に予定を追加」をタップすると onAddEvent を呼ぶ', async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    render(
      <DayEventPanel
        date="2026-09-08"
        byDay={toByDay([])}
        calendarById={calendarById}
        onEventTap={vi.fn()}
        onAddEvent={onAddEvent}
      />,
    );
    await user.click(screen.getByRole('button', { name: '＋ この日に予定を追加' }));
    expect(onAddEvent).toHaveBeenCalled();
  });
});
