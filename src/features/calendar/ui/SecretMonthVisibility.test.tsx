import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Calendar } from '@/data/calendars';
import { hideSecretEvents, type EventItem } from '@/data/events';
import { groupEventsByDay, makePriorityOf } from '@/lib/calendar-view';
import { MonthView } from './MonthView';

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

const event = (id: string, title: string, isSecret: boolean): EventItem => ({
  id,
  calendarId: calendar.id,
  title,
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
  isSecret,
  createdAt: '',
  updatedAt: '',
});

describe('月表示の折りたたみ週セルとシークレット予定', () => {
  it('ロック中は週セルにもシークレット予定を描画しない', () => {
    const calendars = new Map([[calendar.id, calendar]]);
    const events = [event('public', '公開予定', false), event('secret', '秘密予定', true)];
    render(
      <MonthView
        cursor="2026-09-08"
        byDay={groupEventsByDay(hideSecretEvents(events, false), makePriorityOf(calendars))}
        calendarById={calendars}
        today="2026-09-08"
        collapsedToWeekOf="2026-09-08"
        onDayTap={vi.fn()}
        onDayDoubleTap={vi.fn()}
        onBackToMonth={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /公開予定/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /秘密予定/ })).not.toBeInTheDocument();
  });
});
