import { useMemo } from 'react';
import { selectFeaturedEvents } from '@core';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { makePriorityOf } from '@/lib/calendar-view';

/**
 * ホームのコンパクトビューに出す代表予定。
 * 表示オンのカレンダーの予定だけを対象に、`selectFeaturedEvents`(packages/core)へ通す。
 * `now` は events/calendars/count が変わるたびに取り直す(開きっぱなしの自動更新は範囲外)。
 */
export function useFeaturedEvents(
  events: EventItem[],
  calendars: Calendar[],
  count: number,
): EventItem[] {
  return useMemo(() => {
    const calendarById = new Map(calendars.map((c) => [c.id, c]));
    const visibleIds = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
    const visible = events.filter((e) => visibleIds.has(e.calendarId));
    const now = new Date().toISOString();
    return selectFeaturedEvents(visible, makePriorityOf(calendarById), now, count);
  }, [events, calendars, count]);
}
