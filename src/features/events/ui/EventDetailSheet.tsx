import { BottomSheet } from '@/ui/BottomSheet';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { formatClock, formatEventDate, formatEventTime } from '@/lib/datetime';

interface EventDetailSheetProps {
  /** null なら閉じている。 */
  event: EventItem | null;
  calendar: Calendar | undefined;
  onClose: () => void;
}

/**
 * 取り込んだ予定の読み取り専用詳細(Story 3.3 / 5.3)。
 * Google・端末カレンダーから取り込んだ予定は編集・削除できない(AD-2)。編集用の
 * EventFormSheet とは別コンポーネントにして、外部予定に書き込み経路を作らないことを
 * 構造で担保する。
 */
export function EventDetailSheet({ event, calendar, onClose }: EventDetailSheetProps) {
  const when = (() => {
    if (!event) return '';
    if (event.allDay && event.eventDate) return formatEventDate(event.eventDate);
    if (event.startsAt) {
      const start = formatEventTime(event.startsAt);
      return event.endsAt ? `${start} 〜 ${formatClock(event.endsAt)}` : start;
    }
    return '';
  })();

  return (
    <BottomSheet open={event !== null} title="予定の詳細" onClose={onClose}>
      {event && (
        <div className="space-y-3">
          <p className="text-body font-semibold text-ink-primary">{event.title}</p>

          <p className="text-meta text-ink-secondary tabular">{when}</p>

          <p className="flex items-center gap-2 text-meta text-ink-secondary">
            <span
              aria-hidden="true"
              className="h-3 w-3 flex-none rounded-[3px]"
              style={{ backgroundColor: calendar?.color ?? 'var(--color-ink-disabled)' }}
            />
            {calendar?.name ?? '不明なカレンダー'}
          </p>

          {event.note && (
            <p className="whitespace-pre-wrap text-body text-ink-primary">{event.note}</p>
          )}

          <p className="border-t border-border-hairline pt-3 text-meta text-ink-secondary">
            {event.source === 'device'
              ? 'この予定は端末のカレンダーから取り込んだものです。編集はできません。'
              : 'この予定は Google カレンダーから取り込んだものです。編集はできません。'}
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
