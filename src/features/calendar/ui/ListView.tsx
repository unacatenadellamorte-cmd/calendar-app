import { t, useLanguage } from '@/i18n';
import { useEffect, useMemo, useRef } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { groupEventsByDay, makePriorityOf } from '@/lib/calendar-view';
import { formatDayTitle } from '@/lib/datetime';
import { EventListItem } from '@/features/events/ui/EventListItem';
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
  const byDay = useMemo(() => groupEventsByDay(events, priorityOf), [events, priorityOf]);
  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const headerRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const target = days.find((d) => d >= scrollTo);
    if (!target) return;
    try {
      headerRefs.current.get(target)?.scrollIntoView({ block: 'start' });
    } catch {
      // jsdom は scrollIntoView 未実装。無視する。
    }
  }, [days, scrollTo]);
  if (days.length === 0) {
    return <p className="text-meta text-ink-secondary">{t('予定はありません')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {days.map((date) => (
        <section key={date}>
          <h3
            ref={(el) => {
              if (el) headerRefs.current.set(date, el);
            }}
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
  );
}
