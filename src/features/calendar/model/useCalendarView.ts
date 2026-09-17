import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { todayLocalDate } from '@/lib/datetime';
import { addDays, addMonths, addYears } from '@/lib/calendar-view';

export type ViewMode = 'month' | 'week' | 'list' | 'year';

/**
 * カレンダー画面の表示状態。画面を開くたび月表示を既定にする。
 * cursor 日付は `initialDate`(ホームの代表予定タップ等)があればその日、無ければ「今日」。
 * 表示オンのカレンダーの予定だけを導出する。
 */
export function useCalendarView(
  events: EventItem[],
  calendars: Calendar[],
  initialDate?: string,
) {
  const [view, setViewState] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState<string>(() => initialDate ?? todayLocalDate());

  // マウント後に initialDate が変わったら(別の日の予定から遷移し直した等)追従する。
  useEffect(() => {
    if (initialDate) setCursor(initialDate);
  }, [initialDate]);

  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
  }, []);

  const visibleEvents = useMemo(() => {
    const visibleIds = new Set(
      calendars.filter((c) => c.isVisible).map((c) => c.id),
    );
    return events.filter((e) => visibleIds.has(e.calendarId));
  }, [events, calendars]);

  const goToday = useCallback(() => setCursor(todayLocalDate()), []);
  const jumpTo = useCallback((date: string) => setCursor(date), []);
  const goPrev = useCallback(() => {
    setCursor((c) =>
      view === 'year' ? addYears(c, -1) : view === 'month' ? addMonths(c, -1) : addDays(c, -1),
    );
  }, [view]);
  const goNext = useCallback(() => {
    setCursor((c) =>
      view === 'year' ? addYears(c, 1) : view === 'month' ? addMonths(c, 1) : addDays(c, 1),
    );
  }, [view]);

  return { view, setView, cursor, visibleEvents, goToday, goPrev, goNext, jumpTo };
}
