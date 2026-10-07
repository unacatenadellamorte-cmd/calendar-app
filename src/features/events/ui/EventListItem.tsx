import { t, useLanguage } from '@/i18n';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { eventLabelColor, labelTextColor } from '@/lib/event-label';
import { formatClock, formatEventDate, formatEventTime } from '@/lib/datetime';
import { EventStamp } from '@/ui/EventStamp';
import { isEventStampId } from '@/lib/event-stamps';
interface EventListItemProps {
  event: EventItem;
  calendar: Calendar | undefined;
  onEdit: (event: EventItem) => void;
  /** true なら日付を省き時刻のみ表示(日付見出しのあるリストビュー用)。 */
  compact?: boolean;
}
export function EventListItem({
  event,
  calendar,
  onEdit,
  compact = false,
}: EventListItemProps) {
  useLanguage();
  const filled = event.source === 'local';
  const color = eventLabelColor(event, calendar);
  const knownStampId = isEventStampId(event.stampId) ? event.stampId : null;
  const stampOnly = Boolean(event.stampOnly && knownStampId);
  let when = '';
  if (event.allDay && event.eventDate) {
    when = compact ? t('終日') : formatEventDate(event.eventDate);
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
        {!filled && (
          <span
            aria-hidden="true"
            className="h-8 w-1 flex-none rounded-full"
            style={{ backgroundColor: calendar?.color ?? 'var(--color-ink-disabled)' }}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-meta text-ink-secondary tabular">{when}</span>
          <span
            className="flex items-center gap-1 truncate rounded-sm text-body text-ink-primary"
            style={
              filled
                ? {
                    backgroundColor: color,
                    color: labelTextColor(color),
                    paddingInline: 6,
                    paddingBlock: 2,
                  }
                : undefined
            }
          >
            {knownStampId && (
              <EventStamp
                id={knownStampId}
                color={filled ? labelTextColor(color) : 'currentColor'}
              />
            )}
            {!stampOnly && event.title}
          </span>
        </span>
        <span className="flex-none text-meta text-ink-secondary">
          {calendar?.name ?? t('不明なカレンダー')}
        </span>
      </button>
    </li>
  );
}
