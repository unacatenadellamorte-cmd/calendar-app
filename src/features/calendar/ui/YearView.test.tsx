import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { YearView } from './YearView';

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
const lowCalendar: Calendar = { ...calendar, id: 'c2', name: '低優先', color: '#009E73', priority: 1 };
const calendarById = new Map([
  ['c1', calendar],
  ['c2', lowCalendar],
]);

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

function setup(events: EventItem[] = []) {
  const onMonthTap = vi.fn();
  const onDayTap = vi.fn();
  render(
    <YearView
      cursor="2026-09-08"
      events={events}
      calendarById={calendarById}
      today="2026-09-08"
      onMonthTap={onMonthTap}
      onDayTap={onDayTap}
    />,
  );
  return { onMonthTap, onDayTap };
}

describe('YearView', () => {
  it('1〜12月ぶんの月見出しとミニグリッドを縦に並べる', () => {
    setup();
    for (let m = 1; m <= 12; m += 1) {
      expect(screen.getByRole('button', { name: `2026年${m}月` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '2026年9月8日を開く' })).toBeInTheDocument();
  });

  it('予定がある日には最優先カレンダーの色のドットが出て、aria-labelにも(予定あり)が付く。無い日はドット無し', () => {
    setup([ev({ id: 'x', calendarId: 'c1' })]); // 2026-09-08
    const withEvent = screen.getByRole('button', { name: '2026年9月8日を開く(予定あり)' });
    expect(withEvent.querySelector('[aria-hidden="true"]')).toHaveStyle({
      backgroundColor: '#C6413B',
    });

    const withoutEvent = screen.getByRole('button', { name: '2026年9月9日を開く' });
    expect(withoutEvent.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('同日に複数カレンダーの予定があるとき、優先度が高いカレンダーの色を1つだけ出す', () => {
    setup([
      ev({ id: 'low', calendarId: 'c2', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-08T01:00:00Z' }),
      ev({ id: 'high', calendarId: 'c1', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' }),
    ]);
    const cell = screen.getByRole('button', { name: '2026年9月8日を開く(予定あり)' });
    const dots = cell.querySelectorAll('[aria-hidden="true"]');
    expect(dots).toHaveLength(1);
    expect(dots[0]).toHaveStyle({ backgroundColor: '#C6413B' });
  });

  it('日付セルをタップすると onDayTap(その日) を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onDayTap } = setup();
    await user.click(screen.getByRole('button', { name: '2026年9月15日を開く' }));
    expect(onDayTap).toHaveBeenCalledWith('2026-09-15');
  });

  it('月見出しをタップすると onMonthTap(その月1日) を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onMonthTap } = setup();
    await user.click(screen.getByRole('button', { name: '2026年3月' }));
    expect(onMonthTap).toHaveBeenCalledWith('2026-03-01');
  });

  it('月境界のはみ出し日はボタンとして重複させない(実体は隣の月グリッド側だけ)', () => {
    setup();
    // 2026年9月グリッドの末尾のはみ出し日(10/1〜10/3、inMonth: false)は非インタラクティブにし、
    // 実体である10月グリッド側の同じ日付だけがボタンとして存在する
    // (重複していれば getByRole は複数ヒットで例外になり、このテストは失敗する)。
    expect(screen.getByRole('button', { name: '2026年10月1日を開く' })).toBeInTheDocument();
  });
});
