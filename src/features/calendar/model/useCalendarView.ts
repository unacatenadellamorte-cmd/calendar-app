import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { todayLocalDate } from '@/lib/datetime';
import { addDays, addMonths } from '@/lib/calendar-view';

export type ViewMode = 'month' | 'week' | 'list';

const VIEW_MODES: ViewMode[] = ['month', 'week', 'list'];
const STORAGE_KEY = 'calendar-app.view';

function readStoredView(): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (VIEW_MODES as string[]).includes(raw)) return raw as ViewMode;
  } catch {
    // localStorage 不可(プライベートモード等)。既定に落とす。
  }
  return 'month';
}

/**
 * カレンダー画面の表示状態。選択中のビューは localStorage に保存して次回復元する。
 * cursor 日付は `initialDate`(ホームの代表予定タップ等)があればその日、無ければ「今日」。
 * 表示オンのカレンダーの予定だけを導出する。
 */
export function useCalendarView(
  events: EventItem[],
  calendars: Calendar[],
  initialDate?: string,
) {
  const [view, setViewState] = useState<ViewMode>(readStoredView);
  const [cursor, setCursor] = useState<string>(() => initialDate ?? todayLocalDate());

  // マウント後に initialDate が変わったら(別の日の予定から遷移し直した等)追従する。
  useEffect(() => {
    if (initialDate) setCursor(initialDate);
  }, [initialDate]);

  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても表示は切り替える。
    }
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
    setCursor((c) => (view === 'month' ? addMonths(c, -1) : addDays(c, -1)));
  }, [view]);
  const goNext = useCallback(() => {
    setCursor((c) => (view === 'month' ? addMonths(c, 1) : addDays(c, 1)));
  }, [view]);

  return { view, setView, cursor, visibleEvents, goToday, goPrev, goNext, jumpTo };
}
