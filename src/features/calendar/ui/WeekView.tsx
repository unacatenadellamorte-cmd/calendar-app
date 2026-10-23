import { t, useLanguage, weekdayLabels } from '@/i18n';
import { useEffect, useMemo, useRef } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { compareEventsForList } from '@core';
import { addDays, eventOccursOnDate, layoutDayEvents, makePriorityOf, ymd } from '@/lib/calendar-view';
import { minutesIntoLocalDay } from '@/lib/datetime';
import { EventChip } from './EventChip';
import { DayPhotoSection } from './DayPhotoSection';
import { SwipeSurface } from './SwipeSurface';
interface WeekViewProps {
  cursor: string;
  events: EventItem[];
  calendarById: Map<string, Calendar>;
  today: string;
  onSlotTap: (startLocal: string) => void;
  onEventTap: (event: EventItem) => void;
  photosSuspended?: boolean;
  userId?: string;
  /** 週の帯・当日予定の送りと帯の日付タップで cursor を動かす。未指定なら帯と送りは出さない。 */
  onDateChange?: (date: string) => void;
}
const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_SCROLL_HOUR = 7;
/**
 * 週ビュー。v1 は cursor 当日の1日タイムライン(複数日横並びは将来)。
 * 重なりは列に分割。終日は上部の帯。空きスロットタップで追加。
 */
export function WeekView({
  cursor,
  events,
  calendarById,
  today,
  onSlotTap,
  onEventTap,
  photosSuspended,
  userId,
  onDateChange,
}: WeekViewProps) {
  useLanguage();
  // 重なり順・終日帯の並びは所属カレンダーの優先度順(Story 2.3)。
  const priorityOf = useMemo(() => makePriorityOf(calendarById), [calendarById]);
  const dayEvents = useMemo(
    () => events.filter((e) => eventOccursOnDate(e, cursor)),
    [events, cursor],
  );
  const allDayEvents = useMemo(
    () =>
      dayEvents
        .filter((e) => e.allDay)
        .sort(
          (a, b) => compareEventsForList(a, b, priorityOf) || a.title.localeCompare(b.title),
        ),
    [dayEvents, priorityOf],
  );
  const positioned = useMemo(
    () => layoutDayEvents(dayEvents, priorityOf, cursor),
    [dayEvents, priorityOf, cursor],
  );
  const nowMin = cursor === today ? minutesIntoLocalDay(new Date().toISOString()) : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 開いた時は日中(既定 7:00、または最初の予定/現在時刻)を見せる。
    const firstMin =
      positioned.length > 0 ? Math.min(...positioned.map((p) => p.startMin)) : null;
    const targetMin = nowMin ?? firstMin ?? DEFAULT_SCROLL_HOUR * 60;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (targetMin / 60) * HOUR_PX - HOUR_PX);
    }
    // cursor 変更時に再スクロール。nowMin/positioned は cursor に従属。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);
  const pad = (n: number) => String(n).padStart(2, '0');
  // cursor を含む日曜始まりの7日(月表示の折りたたみ週と同じ並び)。
  const weekDays = useMemo(() => {
    const { year, month, day } = ymd(cursor);
    const start = addDays(cursor, -new Date(year, month - 1, day).getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);
  const labels = weekdayLabels();
  const pageContentVersion = useMemo(() => ({ events, calendarById, userId }), [events, calendarById, userId]);
  const shiftDay = (delta: 1 | -1) => onDateChange?.(addDays(cursor, delta));
  const shiftWeek = (delta: 1 | -1) => onDateChange?.(addDays(cursor, delta * 7));
  const content = (
    <>
      <div className="mb-2 flex items-start gap-2 border-b border-border-hairline pb-2">
        <span className="mt-0.5 flex-none text-meta text-ink-secondary">{t('終日')}</span>
        <div className="flex flex-1 flex-wrap gap-1">
          {allDayEvents.length === 0 ? (
            <span className="text-meta text-ink-disabled">{t('なし')}</span>
          ) : (
            allDayEvents.map((event) => (
              <span key={event.id} className="max-w-[14rem] flex-none">
                <EventChip
                  event={event}
                  calendar={calendarById.get(event.calendarId)}
                  onTap={onEventTap}
                />
              </span>
            ))
          )}
        </div>
      </div>

      <div ref={scrollRef} data-page-scroll className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
        <div className="flex">
          <div className="relative w-12 flex-none" style={{ height: HOUR_PX * 24 }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 text-meta tabular text-ink-secondary"
                style={{ top: h * HOUR_PX - 6 }}
              >
                {h}:00
              </div>
            ))}
          </div>

          <div className="relative flex-1" style={{ height: HOUR_PX * 24 }}>
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onSlotTap(`${cursor}T${pad(h)}:00`)}
                aria-label={t('{0}時に予定を追加', [h])}
                className="block w-full border-t border-border-hairline"
                style={{ height: HOUR_PX }}
              />
            ))}

            {positioned.map((p) => {
              const widthPct = 100 / p.columnCount;
              return (
                <EventChip
                  key={p.event.id}
                  event={p.event}
                  calendar={calendarById.get(p.event.calendarId)}
                  onTap={onEventTap}
                  wrap
                  style={{
                    position: 'absolute',
                    top: (p.startMin / 60) * HOUR_PX,
                    height: Math.max(((p.endMin - p.startMin) / 60) * HOUR_PX, 18),
                    left: `${p.column * widthPct}%`,
                    width: `calc(${widthPct}% - 2px)`,
                  }}
                />
              );
            })}

            {nowMin != null && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t-2 border-accent"
                style={{ top: (nowMin / 60) * HOUR_PX }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
  const photos = <DayPhotoSection date={cursor} suspended={photosSuspended} userId={userId} />;
  if (!onDateChange) return <div>{content}{photos}</div>;
  return (
    <div>
      <SwipeSurface onSwipe={shiftWeek} className="mb-2" pageKey={weekDays[0]}>
        <div className="grid grid-cols-7 text-center" data-testid="week-strip">
          {weekDays.map((date, i) => (
            <button
              key={date}
              type="button"
              aria-pressed={date === cursor}
              aria-label={t('{0}月{1}日を開く', [ymd(date).month, ymd(date).day])}
              onClick={() => onDateChange(date)}
              className={[
                'touch-manipulation flex min-h-11 flex-col items-center justify-center rounded-sm text-meta tabular',
                date === cursor ? 'ring-2 ring-inset ring-accent' : '',
                date === today ? 'font-semibold text-accent' : 'text-ink-secondary',
              ].join(' ')}
            >
              <span>{labels[i]}</span>
              <span>{ymd(date).day}</span>
            </button>
          ))}
        </div>
      </SwipeSurface>
      <SwipeSurface onSwipe={shiftDay} pageKey={cursor} contentVersion={pageContentVersion} footer={photos}>
        {content}
      </SwipeSurface>
    </div>
  );
}
