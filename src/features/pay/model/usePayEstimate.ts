import { useCallback, useMemo, useState } from 'react';
import { monthlyPayEstimate, type PayableShift } from '@core';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { addMonths, ymd } from '@/lib/calendar-view';
import { localDateOf, todayLocalDate } from '@/lib/datetime';

/**
 * 当月(± monthOffset)のシフト実体を集計する view-model(FR-14 / FR-15 / NFR9)。
 * シフト実体 = 所属カレンダーが `isShift` の時刻付き予定。集計は保存せず都度計算。
 * 暦月の判定は表示層(ここ)、金額の合算は `packages/core`(AD-7)。
 */

const MAX_FUTURE_MONTHS = 12;

export interface PayEstimate {
  amount: number;
  shiftCount: number;
  /** 表示用の月ラベル(例 "9月")。 */
  monthLabel: string;
  /** その月のシフト(日付昇順)。内訳シート用。 */
  shifts: EventItem[];
  prev: () => void;
  next: () => void;
  canNext: boolean;
}

export function usePayEstimate(events: EventItem[], calendars: Calendar[]): PayEstimate {
  const [monthOffset, setMonthOffset] = useState(0);

  const prev = useCallback(() => setMonthOffset((n) => n - 1), []);
  const next = useCallback(
    () => setMonthOffset((n) => Math.min(MAX_FUTURE_MONTHS, n + 1)),
    [],
  );

  return useMemo(() => {
    const monthStart = addMonths(`${todayLocalDate().slice(0, 7)}-01`, monthOffset);
    const { year, month } = ymd(monthStart);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    const shiftCalendarIds = new Set(
      calendars.filter((c) => c.isShift).map((c) => c.id),
    );

    const shifts = events
      .filter(
        (e) =>
          !e.allDay &&
          e.startsAt !== null &&
          shiftCalendarIds.has(e.calendarId) &&
          localDateOf(e.startsAt).startsWith(prefix),
      )
      .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));

    const payable: PayableShift[] = shifts.map((e) => ({
      startsAt: e.startsAt as string,
      endsAt: e.endsAt ?? (e.startsAt as string),
      breakMinutes: e.breakMinutes ?? 0,
      hourlyWage: e.hourlyWage ?? 0,
    }));

    const { amount, shiftCount } = monthlyPayEstimate(payable);

    return {
      amount,
      shiftCount,
      monthLabel: `${month}月`,
      shifts,
      prev,
      next,
      canNext: monthOffset < MAX_FUTURE_MONTHS,
    };
  }, [events, calendars, monthOffset, prev, next]);
}
