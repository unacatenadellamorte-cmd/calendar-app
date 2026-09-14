import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
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
  createdAt: '',
  updatedAt: '',
  ...over,
});

function setup(events: EventItem[] = []) {
  const onDayTap = vi.fn();
  const onEventTap = vi.fn();
  const onOverflowTap = vi.fn();
  render(
    <MonthView
      cursor="2026-09-08"
      events={events}
      calendarById={calendarById}
      today="2026-09-08"
      onDayTap={onDayTap}
      onEventTap={onEventTap}
      onOverflowTap={onOverflowTap}
    />,
  );
  return { onDayTap, onEventTap, onOverflowTap };
}

describe('MonthView', () => {
  it('曜日ヘッダと日セルを描画する', () => {
    setup();
    for (const w of ['日', '月', '火', '水', '木', '金', '土']) {
      expect(screen.getByText(w)).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: '9月15日を開く' }),
    ).toBeInTheDocument();
  });

  it('日セルの日付番号をタップすると onDayTap(その日) を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onDayTap } = setup();
    await user.click(screen.getByRole('button', { name: '9月15日を開く' }));
    expect(onDayTap).toHaveBeenCalledWith('2026-09-15');
  });

  it('チップをタップすると onEventTap(その予定) を呼ぶ', async () => {
    const user = userEvent.setup();
    const target = ev({ id: 'x', title: '役員会議' });
    const { onEventTap, onDayTap } = setup([target]);
    await user.click(screen.getByRole('button', { name: /役員会議/ }));
    expect(onEventTap).toHaveBeenCalledWith(target);
    expect(onDayTap).not.toHaveBeenCalled();
  });

  it('表示中の月グリッド外の予定は描画しない', () => {
    setup([
      ev({
        id: 'next-month',
        title: '来月の予定',
        startsAt: '2026-10-15T01:00:00Z',
        endsAt: '2026-10-15T02:00:00Z',
      }),
    ]);
    expect(screen.queryByRole('button', { name: /来月の予定/ })).not.toBeInTheDocument();
  });

  it('同日4件は3件 +「他 1 件」、タップで onOverflowTap を呼ぶ', async () => {
    const user = userEvent.setup();
    const sameDay = [0, 1, 2, 3].map((i) =>
      ev({
        id: `s${i}`,
        title: `予定${i}`,
        startsAt: `2026-09-08T0${i}:00:00Z`,
        endsAt: `2026-09-08T0${i + 1}:00:00Z`,
      }),
    );
    const { onOverflowTap } = setup(sameDay);
    expect(screen.queryByRole('button', { name: /予定3/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '他 1 件' }));
    expect(onOverflowTap).toHaveBeenCalledWith('2026-09-08');
  });

  it('セルに入りきらない時は優先度の高いカレンダーの予定から見せる', () => {
    // 高優先度(priority 0)の遅い予定2件が、低優先度(priority 1)の早い予定より先に出る。
    const twoCals = new Map<string, Calendar>([
      ['c1', calendar],
      ['c2', { ...calendar, id: 'c2', name: '低優先', priority: 1 }],
    ]);
    render(
      <MonthView
        cursor="2026-09-08"
        events={[
          ev({ id: 'lo0', title: '低0', calendarId: 'c2', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-08T01:00:00Z' }),
          ev({ id: 'lo1', title: '低1', calendarId: 'c2', startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z' }),
          ev({ id: 'hi0', title: '高0', calendarId: 'c1', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' }),
          ev({ id: 'hi1', title: '高1', calendarId: 'c1', startsAt: '2026-09-08T06:00:00Z', endsAt: '2026-09-08T07:00:00Z' }),
        ]}
        calendarById={twoCals}
        today="2026-09-08"
        onDayTap={vi.fn()}
        onEventTap={vi.fn()}
        onOverflowTap={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /高0/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /高1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /低0/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /低1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '他 1 件' })).toBeInTheDocument();
  });
});
