import type { EventItem } from '@/data/events';
import { compareEventsForList, type PriorityLookup } from '@core';
import { addDays, eventOccursOnDate } from './calendar-view';

export interface MonthEventSlot {
  event: EventItem;
  joinedBefore: boolean;
  joinedAfter: boolean;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** 翌日の表示段との差。境目の接続線だけを傾ける。 */
  nextLaneOffset: number;
}

/** 各日の表示順で隙間なく詰め、日またぎ予定は細い線で接続する。 */
export function layoutMonthEventSlots(
  dates: readonly string[],
  byDay: ReadonlyMap<string, EventItem[]>,
  limit: number,
  priorityOf: PriorityLookup = () => 0,
): Map<string, (MonthEventSlot | null)[]> {
  const result = new Map<string, (MonthEventSlot | null)[]>();
  for (let start = 0; start < dates.length; start += 7) {
    const week = dates.slice(start, start + 7);
    const shown = week.map((date) => [...(byDay.get(date) ?? [])]
      .sort((a, b) => compareEventsForList(a, b, priorityOf)).filter((event, index) =>
      index < limit || eventOccursOnDate(event, addDays(date, -1)) || eventOccursOnDate(event, addDays(date, 1)),
    ));
    week.forEach((date, day) => {
      const slots = shown[day]!.map((event, lane): MonthEventSlot => {
        const nextLane = shown[day + 1]?.findIndex((item) => item.id === event.id) ?? -1;
        return {
          event,
          joinedBefore: shown[day - 1]?.some((item) => item.id === event.id) ?? false,
          joinedAfter: nextLane >= 0,
          continuesBefore: eventOccursOnDate(event, addDays(date, -1)),
          continuesAfter: eventOccursOnDate(event, addDays(date, 1)),
          nextLaneOffset: nextLane >= 0 ? nextLane - lane : 0,
        };
      });
      result.set(date, slots);
    });
  }
  return result;
}
