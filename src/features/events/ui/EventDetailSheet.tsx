import { t, useLanguage } from '@/i18n';
import { BottomSheet } from '@/ui/BottomSheet';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { formatClock, formatEventDate, formatEventTime } from '@/lib/datetime';
import { ReminderPicker } from './ReminderPicker';
import { openExternalUrl, openMap } from '@/platform/externalLinks';
interface EventDetailSheetProps {
  /** null なら閉じている。 */
  event: EventItem | null;
  calendar: Calendar | undefined;
  onClose: () => void;
  /** リマインダーを設定/解除する(Story 5.4)。source を問わず許可(FR20)。 */
  onSetReminder: (event: EventItem, minutes: number | null) => Promise<boolean>;
}
/**
 * 取り込んだ予定の読み取り専用詳細(Story 3.3 / 5.3)。
 * Google・端末カレンダーから取り込んだ予定は編集・削除できない(AD-2)。編集用の
 * EventFormSheet とは別コンポーネントにして、外部予定に書き込み経路を作らないことを
 * 構造で担保する。
 */
export function EventDetailSheet({
  event,
  calendar,
  onClose,
  onSetReminder,
}: EventDetailSheetProps) {
  useLanguage();
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
    <BottomSheet open={event !== null} title={t('予定の詳細')} onClose={onClose}>
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
            {calendar?.name ?? t('不明なカレンダー')}
          </p>

          {event.note && (
            <p className="whitespace-pre-wrap text-body text-ink-primary">{event.note}</p>
          )}

          {event.location && (
            <button
              type="button"
              className="block text-left text-body text-accent underline"
              onClick={() => void openMap(event.location!).then((ok) => {
                if (!ok) window.alert(t('地図を開けませんでした'));
              })}
            >
              {event.location}
            </button>
          )}
          {event.url && (
            <button
              type="button"
              className="block max-w-full break-all text-left text-body text-accent underline"
              onClick={() => void openExternalUrl(event.url!).then((ok) => {
                if (!ok) window.alert(t('リンクを開けませんでした'));
              })}
            >
              {event.url}
            </button>
          )}

          {!event.allDay && (
            <ReminderPicker
              value={event.reminderMinutes}
              onChange={(minutes) => onSetReminder(event, minutes)}
            />
          )}

          <p className="border-t border-border-hairline pt-3 text-meta text-ink-secondary">
            {event.source === 'device'
              ? t('この予定は端末のカレンダーから取り込んだものです。編集はできません。')
              : t('この予定は Google カレンダーから取り込んだものです。編集はできません。')}
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
