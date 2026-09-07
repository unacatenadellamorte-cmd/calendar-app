import { useMemo } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { groupEventsByDay, monthGridDays, ymd } from '@/lib/calendar-view';
import { EventChip } from './EventChip';

interface MonthViewProps {
  cursor: string;
  events: EventItem[];
  calendarById: Map<string, Calendar>;
  today: string;
  onDayTap: (date: string) => void;
  onEventTap: (event: EventItem) => void;
  onOverflowTap: (date: string) => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_CHIPS = 3;

/** 月ビュー。7列グリッド、時刻付き→終日順で最大3件 +「他 N 件」。 */
export function MonthView({
  cursor,
  events,
  calendarById,
  today,
  onDayTap,
  onEventTap,
  onOverflowTap,
}: MonthViewProps) {
  const { year, month } = ymd(cursor);
  const cells = useMemo(() => monthGridDays(year, month, today), [year, month, today]);
  const byDay = useMemo(() => groupEventsByDay(events), [events]);

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-meta text-ink-secondary">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-border-hairline">
        {cells.map((cell) => {
          const dayEvents = byDay.get(cell.date) ?? [];
          const shown = dayEvents.slice(0, MAX_CHIPS);
          const overflow = dayEvents.length - shown.length;

          return (
            <div
              key={cell.date}
              onClick={() => onDayTap(cell.date)}
              className={[
                'flex min-h-20 flex-col gap-0.5 border-r border-b border-border-hairline p-1',
                cell.inMonth ? 'bg-surface-base' : 'bg-surface-sunken',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDayTap(cell.date);
                }}
                aria-label={`${ymd(cell.date).month}月${cell.day}日に予定を追加`}
                className={[
                  'self-start rounded-full px-1 text-meta tabular',
                  cell.isToday
                    ? 'bg-accent font-semibold text-on-accent'
                    : cell.inMonth
                      ? 'text-ink-secondary'
                      : 'text-ink-disabled',
                ].join(' ')}
              >
                {cell.day}
              </button>

              {shown.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  calendar={calendarById.get(event.calendarId)}
                  onTap={onEventTap}
                />
              ))}

              {overflow > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOverflowTap(cell.date);
                  }}
                  className="self-start px-1 text-meta text-ink-secondary"
                >
                  他 {overflow} 件
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
