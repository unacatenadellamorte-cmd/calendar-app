import { t, useLanguage } from '@/i18n';
import { useEffect, useMemo, useRef } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { eventOccursOnDate, makePriorityOf } from '@/lib/calendar-view';
import { formatDayTitle, localDateOf } from '@/lib/datetime';
import { EventListItem } from '@/features/events/ui/EventListItem';
import { compareEventsForList } from '@core';
interface ListViewProps {
  events: EventItem[];
  calendarById: Map<string, Calendar>;
  today: string;
  /** この日付(以降の最初の見出し)へスクロールする。マウント時と、値が変わるたび。 */
  scrollTo: string;
  onEventTap: (event: EventItem) => void;
}
/** リストビュー。日ごとの見出し + その日の予定。`scrollTo` の日へ見出しをスクロールする。 */
export function ListView({
  events,
  calendarById,
  today,
  scrollTo,
  onEventTap,
}: ListViewProps) {
  useLanguage();
  // 日内の並びは所属カレンダーの優先度順(Story 2.2)。未知は最下位相当。
  const priorityOf = useMemo(() => makePriorityOf(calendarById), [calendarById]);
  // 長い複数日予定を全日へ展開せず、未来分は開始日に、今日まで続く過去開始分は今日に一度だけ置く。
  const byDay = useMemo(() => {
    const grouped = new Map<string, EventItem[]>();
    for (const event of events) {
      const startDate = event.allDay ? event.eventDate : event.startsAt ? localDateOf(event.startsAt) : null;
      if (!startDate) continue;
      const date = startDate < today && eventOccursOnDate(event, today) ? today : startDate;
      const dayEvents = grouped.get(date) ?? [];
      dayEvents.push(event);
      grouped.set(date, dayEvents);
    }
    for (const dayEvents of grouped.values()) dayEvents.sort((a, b) => compareEventsForList(a, b, priorityOf));
    return grouped;
  }, [events, priorityOf, today]);
  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const headerRefs = useRef(new Map<string, HTMLElement>());
  const lastScrolledDateRef = useRef<string | null>(null);
  useEffect(() => {
    // 予定の編集・削除で days が変わっただけでは、利用者のスクロール位置を奪わない。
    if (lastScrolledDateRef.current === scrollTo) return;
    const target = days.find((d) => d >= scrollTo) ?? days.at(-1);
    if (!target) return;
    const region = scrollRegionRef.current;
    const section = headerRefs.current.get(target);
    if (!region || !section) return;
    lastScrolledDateRef.current = scrollTo;
    // ページ全体の祖先を動かさず、リスト専用領域だけを移動する。
    const regionTop = region.getBoundingClientRect().top;
    const headerTop = section.getBoundingClientRect().top;
    const top = Math.max(0, region.scrollTop + headerTop - regionTop);
    if (typeof region.scrollTo === 'function') {
      region.scrollTo({ top, behavior: 'smooth' });
    } else {
      // jsdom など scrollTo 未実装環境ではページを動かさない。
      region.scrollTop = top;
    }
  }, [days, scrollTo]);
  if (days.length === 0) {
    return <p className="text-meta text-ink-secondary">{t('予定はありません')}</p>;
  }
  return (
    <div
      ref={scrollRegionRef}
      data-testid="list-scroll-region"
      className="calendar-list-scroll relative max-h-[calc(100dvh-16rem)] min-h-0 overflow-y-auto overscroll-contain pr-1"
    >
      <div className="flex flex-col gap-3">
        {days.map((date) => (
          <section
            key={date}
            ref={(el) => {
              if (el) headerRefs.current.set(date, el);
              else headerRefs.current.delete(date);
            }}
          >
            <h3
              className={[
                'sticky top-0 bg-surface-sunken py-1 text-meta font-semibold',
                date === today ? 'text-accent' : 'text-ink-secondary',
              ].join(' ')}
            >
              {formatDayTitle(date)}
            </h3>
            <ul className="rounded-md border border-border-hairline bg-surface-raised px-3">
              {(byDay.get(date) ?? []).map((event) => (
                <EventListItem
                  key={event.id}
                  event={event}
                  calendar={calendarById.get(event.calendarId)}
                  onEdit={onEventTap}
                  compact
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
