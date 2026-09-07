import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { formatClock, formatEventDate, formatEventTime } from '@/lib/datetime';

interface EventListItemProps {
  event: EventItem;
  calendar: Calendar | undefined;
  onEdit: (event: EventItem) => void;
  /** true なら日付を省き時刻のみ表示(日付見出しのあるリストビュー用)。 */
  compact?: boolean;
}

export function EventListItem({ event, calendar, onEdit, compact = false }: EventListItemProps) {
  let when = '';
  if (event.allDay && event.eventDate) {
    when = compact ? '終日' : formatEventDate(event.eventDate);
  } else if (event.startsAt) {
    when = compact ? formatClock(event.startsAt) : formatEventTime(event.startsAt);
  }

  return (
    <li className="border-b border-border-hairline last:border-b-0">
      <button
        type="button"
        onClick={() => onEdit(event)}
        className="flex min-h-14 w-full items-center gap-3 py-2 pr-2 text-left"
      >
        <span
          aria-hidden="true"
          className="h-8 w-1 flex-none rounded-full"
          style={{ backgroundColor: calendar?.color ?? 'var(--color-ink-disabled)' }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-meta text-ink-secondary tabular">{when}</span>
          <span className="block truncate text-body text-ink-primary">{event.title}</span>
        </span>
        <span className="flex-none text-meta text-ink-secondary">
          {calendar?.name ?? '不明なカレンダー'}
        </span>
      </button>
    </li>
  );
}
