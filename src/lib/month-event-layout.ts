import type { EventItem } from '@/data/events';
import { compareEventsForList, type PriorityLookup } from '@core';
import { addDays, eventOccursOnDate } from './calendar-view';

export interface MonthEventSlot {
  event: EventItem;
  joinedBefore: boolean;
  joinedAfter: boolean;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** 表示順を守って帯を接続する。日またぎ予定は3件の枠に隠さず、必要な段を増やす。 */
export function layoutMonthEventSlots(
  dates: readonly string[],
  byDay: ReadonlyMap<string, EventItem[]>,
  limit: number,
  priorityOf: PriorityLookup = () => 0,
): Map<string, (MonthEventSlot | null)[]> {
  const result = new Map<string, (MonthEventSlot | null)[]>();
  for (let start = 0; start < dates.length; start += 7) {
    const week = dates.slice(start, start + 7);
    const shown = week.map((date) => (byDay.get(date) ?? []).filter((event, index) =>
      index < limit || eventOccursOnDate(event, addDays(date, -1)) || eventOccursOnDate(event, addDays(date, 1)),
    ));
    const runs: { event: EventItem; first: number; last: number }[] = [];
    shown.forEach((events, day) => {
      for (const event of events) {
        if (day > 0 && shown[day - 1]!.some((item) => item.id === event.id)) continue;
        let last = day;
        while (shown[last + 1]?.some((item) => item.id === event.id)) last += 1;
        runs.push({ event, first: day, last });
      }
    });
    runs.sort((a, b) => compareEventsForList(a.event, b.event, priorityOf) || a.first - b.first);
    const lanes: (MonthEventSlot | null)[][] = week.map(() => []);
    for (const run of runs) {
      // 先に配置した上位予定の下に帯を通す。翌日の上位予定も含めて段を確保する。
      let lane = 0;
      for (let day = run.first; day <= run.last; day += 1) {
        lanes[day]!.forEach((slot, index) => { if (slot) lane = Math.max(lane, index + 1); });
      }
      for (let day = run.first; day <= run.last; day += 1) {
        const date = week[day]!;
        while (lanes[day]!.length <= lane) lanes[day]!.push(null);
        lanes[day]![lane] = {
          event: run.event,
          joinedBefore: day > run.first,
          joinedAfter: day < run.last,
          continuesBefore: eventOccursOnDate(run.event, addDays(date, -1)),
          continuesAfter: eventOccursOnDate(run.event, addDays(date, 1)),
        };
      }
    }
    week.forEach((date, day) => {
      const slots = lanes[day]!;
      while (slots.length > 0 && slots.at(-1) === null) slots.pop();
      result.set(date, slots);
    });
  }
  return result;
}
