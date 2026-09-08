import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { WeekView } from './WeekView';

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
  createdAt: '',
  updatedAt: '',
  ...over,
});

function setup(events: EventItem[] = []) {
  const onSlotTap = vi.fn();
  const onEventTap = vi.fn();
  render(
    <WeekView
      cursor="2026-09-08"
      events={events}
      calendarById={calendarById}
      today="2026-01-01"
      onSlotTap={onSlotTap}
      onEventTap={onEventTap}
    />,
  );
  return { onSlotTap, onEventTap };
}

describe('WeekView', () => {
  it('重なる時刻付き予定を2列に分割する', () => {
    setup([
      ev({ id: 'a', title: 'アルファ', startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z' }),
      ev({ id: 'b', title: 'ベータ', startsAt: '2026-09-08T01:30:00Z', endsAt: '2026-09-08T02:30:00Z' }),
    ]);
    const a = screen.getByRole('button', { name: /アルファ/ });
    const b = screen.getByRole('button', { name: /ベータ/ });
    expect(a.style.left).toBe('0%');
    expect(b.style.left).toBe('50%');
  });

  it('終日予定は上部の「終日」帯に出る', () => {
    setup([ev({ id: 'd', title: '合宿', allDay: true, startsAt: null, endsAt: null, eventDate: '2026-09-08' })]);
    expect(screen.getByRole('button', { name: /合宿/ })).toBeInTheDocument();
    expect(screen.queryByText('なし')).not.toBeInTheDocument();
  });

  it('空きスロットをタップすると onSlotTap(その時刻) を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onSlotTap } = setup();
    await user.click(screen.getByRole('button', { name: '9時に予定を追加' }));
    expect(onSlotTap).toHaveBeenCalledWith('2026-09-08T09:00');
  });

  it('別日の予定は出さない', () => {
    setup([ev({ id: 'x', title: '別日', startsAt: '2026-09-10T01:00:00Z', endsAt: '2026-09-10T02:00:00Z' })]);
    expect(screen.queryByRole('button', { name: /別日/ })).not.toBeInTheDocument();
  });

  it('重なりは優先度が高いカレンダーを左端(left:0%)に置く', () => {
    // 低優先度(1)の 13:00–14:30 が早く始まるが、高優先度(0)の 13:30–14:00 が左。
    render(
      <WeekView
        cursor="2026-09-08"
        events={[
          ev({ id: 'low', title: '低優先', calendarId: 'c-low', startsAt: '2026-09-08T04:00:00Z', endsAt: '2026-09-08T05:30:00Z' }),
          ev({ id: 'high', title: '高優先', calendarId: 'c-high', startsAt: '2026-09-08T04:30:00Z', endsAt: '2026-09-08T05:00:00Z' }),
        ]}
        calendarById={
          new Map<string, Calendar>([
            ['c-high', { ...calendar, id: 'c-high', name: '高', priority: 0 }],
            ['c-low', { ...calendar, id: 'c-low', name: '低', priority: 1 }],
          ])
        }
        today="2026-01-01"
        onSlotTap={vi.fn()}
        onEventTap={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /高優先/ }).style.left).toBe('0%');
    expect(screen.getByRole('button', { name: /低優先/ }).style.left).toBe('50%');
  });

  it('終日帯は優先度順に並ぶ', () => {
    render(
      <WeekView
        cursor="2026-09-08"
        events={[
          ev({ id: 'a2', title: '合宿', calendarId: 'c-low', allDay: true, startsAt: null, endsAt: null, eventDate: '2026-09-08' }),
          ev({ id: 'a1', title: '当番', calendarId: 'c-high', allDay: true, startsAt: null, endsAt: null, eventDate: '2026-09-08' }),
        ]}
        calendarById={
          new Map<string, Calendar>([
            ['c-high', { ...calendar, id: 'c-high', name: '高', priority: 0 }],
            ['c-low', { ...calendar, id: 'c-low', name: '低', priority: 1 }],
          ])
        }
        today="2026-01-01"
        onSlotTap={vi.fn()}
        onEventTap={vi.fn()}
      />,
    );
    const allDayChips = screen
      .getAllByRole('button')
      .filter((el) => el.getAttribute('aria-label')?.startsWith('終日 '));
    expect(allDayChips.map((el) => el.getAttribute('aria-label'))).toEqual([
      '終日 当番 高',
      '終日 合宿 低',
    ]);
  });
});
