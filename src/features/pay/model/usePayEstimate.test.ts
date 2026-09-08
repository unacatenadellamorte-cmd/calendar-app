import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { usePayEstimate } from './usePayEstimate';

// 「今日」を 2026-09-15 に固定(Date のみ差し替え)。
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
const normalCal: Calendar = { ...shiftCal, id: 'c1', name: '仕事', isShift: false };

const shiftEvent = (over: Partial<EventItem> = {}): EventItem => ({
  id: 's1',
  calendarId: 'shift',
  title: '平日',
  allDay: false,
  // 2026-09-08 09:00–17:00 JST(00:00Z–08:00Z)
  startsAt: '2026-09-08T00:00:00Z',
  endsAt: '2026-09-08T08:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: 60,
  hourlyWage: 1100,
  workplaceLabel: null,
  shiftTemplateId: 't1',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('usePayEstimate', () => {
  it('当月のシフト用カレンダーの予定を集計する', () => {
    const events = [
      shiftEvent({ id: 'a' }),
      shiftEvent({ id: 'b', startsAt: '2026-09-20T00:00:00Z', endsAt: '2026-09-20T08:00:00Z' }),
    ];
    const { result } = renderHook(() => usePayEstimate(events, [shiftCal]));
    expect(result.current.amount).toBe(15400); // 7h * 1100 * 2
    expect(result.current.shiftCount).toBe(2);
    expect(result.current.monthLabel).toBe('9月');
  });

  it('シフト用でないカレンダーの予定は除外', () => {
    const events = [
      shiftEvent({ id: 'a' }),
      shiftEvent({ id: 'x', calendarId: 'c1' }), // 通常カレンダー
    ];
    const { result } = renderHook(() => usePayEstimate(events, [shiftCal, normalCal]));
    expect(result.current.shiftCount).toBe(1);
  });

  it('別の月のシフトは当月集計に入らない', () => {
    const events = [
      shiftEvent({ id: 'a' }),
      shiftEvent({ id: 'aug', startsAt: '2026-08-25T00:00:00Z', endsAt: '2026-08-25T08:00:00Z' }),
    ];
    const { result } = renderHook(() => usePayEstimate(events, [shiftCal]));
    expect(result.current.shiftCount).toBe(1);
  });

  it('prev / next で対象月が変わる', () => {
    const events = [
      shiftEvent({ id: 'sep' }),
      shiftEvent({ id: 'aug', startsAt: '2026-08-25T00:00:00Z', endsAt: '2026-08-25T08:00:00Z' }),
    ];
    const { result } = renderHook(() => usePayEstimate(events, [shiftCal]));
    expect(result.current.monthLabel).toBe('9月');

    act(() => result.current.prev());
    expect(result.current.monthLabel).toBe('8月');
    expect(result.current.shiftCount).toBe(1); // 8月のシフト

    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.monthLabel).toBe('10月');
    expect(result.current.shiftCount).toBe(0);
  });

  it('シフト0件なら amount 0', () => {
    const { result } = renderHook(() => usePayEstimate([], [shiftCal]));
    expect(result.current.amount).toBe(0);
    expect(result.current.shiftCount).toBe(0);
  });
});
