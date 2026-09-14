import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { todayLocalDate } from '@/lib/datetime';
import { addDays, addMonths } from '@/lib/calendar-view';
import { useCalendarView } from './useCalendarView';

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: 'MTG',
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
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

describe('useCalendarView', () => {
  it('cursor は今日で始まり、既定ビューは month', () => {
    const { result } = renderHook(() => useCalendarView([], []));
    expect(result.current.cursor).toBe(todayLocalDate());
    expect(result.current.view).toBe('month');
  });

  it('setView は localStorage に保存し、再マウントで復元する', () => {
    const first = renderHook(() => useCalendarView([], []));
    act(() => first.result.current.setView('week'));
    expect(window.localStorage.getItem('calendar-app.view')).toBe('week');

    const second = renderHook(() => useCalendarView([], []));
    expect(second.result.current.view).toBe('week');
  });

  it('month では goPrev/goNext が月単位、week では日単位', () => {
    const { result } = renderHook(() => useCalendarView([], []));
    const start = result.current.cursor;

    act(() => result.current.goNext());
    expect(result.current.cursor).toBe(addMonths(start, 1));

    act(() => result.current.setView('week'));
    act(() => result.current.goPrev());
    expect(result.current.cursor).toBe(addDays(addMonths(start, 1), -1));
  });

  it('initialDate を渡すと cursor がその日で始まる', () => {
    const { result } = renderHook(() => useCalendarView([], [], '2026-12-25'));
    expect(result.current.cursor).toBe('2026-12-25');
  });

  it('initialDate 省略時は今日(回帰)', () => {
    const { result } = renderHook(() => useCalendarView([], []));
    expect(result.current.cursor).toBe(todayLocalDate());
  });

  it('initialDate が後から変わると cursor が追従する', () => {
    const { result, rerender } = renderHook(
      ({ d }: { d?: string }) => useCalendarView([], [], d),
      { initialProps: { d: '2026-12-25' } },
    );
    expect(result.current.cursor).toBe('2026-12-25');
    rerender({ d: '2027-01-02' });
    expect(result.current.cursor).toBe('2027-01-02');
  });

  it('goToday / jumpTo で cursor が動く', () => {
    const { result } = renderHook(() => useCalendarView([], []));
    act(() => result.current.jumpTo('2026-12-25'));
    expect(result.current.cursor).toBe('2026-12-25');
    act(() => result.current.goToday());
    expect(result.current.cursor).toBe(todayLocalDate());
  });

  it('visibleEvents は表示オンのカレンダーの予定だけ', () => {
    const events = [
      ev({ id: 'a', calendarId: 'c1' }),
      ev({ id: 'b', calendarId: 'c2' }),
      ev({ id: 'c', calendarId: 'unknown' }),
    ];
    const calendars = [cal({ id: 'c1', isVisible: true }), cal({ id: 'c2', isVisible: false })];
    const { result } = renderHook(() => useCalendarView(events, calendars));
    expect(result.current.visibleEvents.map((e) => e.id)).toEqual(['a']);
  });
});
