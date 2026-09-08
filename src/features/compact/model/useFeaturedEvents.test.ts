import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { useFeaturedEvents } from './useFeaturedEvents';

// 「今日」を固定する(Date だけを差し替え、タイマーは触らない)。
const NOW = new Date('2026-09-08T03:00:00Z');
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

const cal = (over: Partial<Calendar>): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const ev = (over: Partial<EventItem>): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '予定',
  allDay: false,
  startsAt: '2026-09-08T06:00:00Z',
  endsAt: '2026-09-08T07:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('useFeaturedEvents', () => {
  it('この後の予定を優先度順で count 件返す', () => {
    const calendars = [cal({ id: 'high', priority: 0 }), cal({ id: 'low', priority: 1 })];
    const events = [
      ev({ id: 'a', calendarId: 'low', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' }),
      ev({ id: 'b', calendarId: 'high', startsAt: '2026-09-08T09:00:00Z', endsAt: '2026-09-08T10:00:00Z' }),
    ];
    const { result } = renderHook(() => useFeaturedEvents(events, calendars, 3));
    expect(result.current.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('表示オフのカレンダーの予定は除外する', () => {
    const calendars = [cal({ id: 'shown', priority: 1, isVisible: true }), cal({ id: 'hidden', priority: 0, isVisible: false })];
    const events = [
      ev({ id: 'v', calendarId: 'shown', startsAt: '2026-09-08T09:00:00Z', endsAt: '2026-09-08T10:00:00Z' }),
      ev({ id: 'h', calendarId: 'hidden', startsAt: '2026-09-08T08:00:00Z', endsAt: '2026-09-08T09:00:00Z' }),
    ];
    const { result } = renderHook(() => useFeaturedEvents(events, calendars, 3));
    expect(result.current.map((e) => e.id)).toEqual(['v']);
  });

  it('count で打ち切る', () => {
    const calendars = [cal({ id: 'c1' })];
    const events = [10, 11, 12].map((h) =>
      ev({ id: `e${h}`, startsAt: `2026-09-08T${h}:00:00Z`, endsAt: `2026-09-08T${h + 1}:00:00Z` }),
    );
    const { result } = renderHook(() => useFeaturedEvents(events, calendars, 2));
    expect(result.current.map((e) => e.id)).toEqual(['e10', 'e11']);
  });

  it('この後に予定が無ければ空', () => {
    const calendars = [cal({ id: 'c1' })];
    const past = [ev({ id: 'p', startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z' })];
    const { result } = renderHook(() => useFeaturedEvents(past, calendars, 3));
    expect(result.current).toEqual([]);
  });
});
