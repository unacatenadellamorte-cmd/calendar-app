import { t, useLanguage } from '@/i18n';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { formatDayTitle } from '@/lib/datetime';
import { EventListItem } from '@/features/events/ui/EventListItem';
import { DayPhotoSection } from './DayPhotoSection';
import { SwipeSurface } from './SwipeSurface';
interface DayEventPanelProps {
  /** 選択中の日付 "YYYY-MM-DD"。 */
  date: string;
  /** 日付("YYYY-MM-DD")→ その日の予定(優先度順)。呼び出し元(`CalendarScreen`)で計算済みのものを渡す。 */
  byDay: Map<string, EventItem[]>;
  calendarById: Map<string, Calendar>;
  onEventTap: (event: EventItem) => void;
  /** 「＋ この日に予定を追加」。呼び出し側で `date` をシードした予定フォームを開く想定。 */
  onAddEvent: () => void;
  /** 予定の入力・詳細シートが開いている間は true。写真の拡大表示を重ねない。 */
  photosSuspended?: boolean;
  /** 利用者の識別子(写真の解放用)。 */
  userId?: string;
  /** 当日予定の横スワイプ。左スワイプ(翌日)は +1、右スワイプ(前日)は -1。 */
  onDayShift?: (delta: 1 | -1) => void;
}
/**
 * 月表示の折りたたみ(Option C)の下に出す、選択中の日付の予定一覧パネル。
 * 描画は `ListView.tsx` の1日ぶん(見出し + `EventListItem` 一覧)と同じ流儀。
 * 閉じるボタンは持たない(月表示への復帰は `MonthView` 側の「月表示に戻る」に一本化)。
 */
export function DayEventPanel({
  date,
  byDay,
  calendarById,
  onEventTap,
  onAddEvent,
  photosSuspended = false,
  userId,
  onDayShift,
}: DayEventPanelProps) {
  useLanguage();
  const dayEvents = byDay.get(date) ?? [];
  const body = (
    <section className="mt-3 animate-[fade-in_200ms_ease-out]">
      <h3 className="mb-1 text-body font-semibold text-ink-primary">{formatDayTitle(date)}</h3>
      {dayEvents.length === 0 ? (
        <p className="text-meta text-ink-secondary">{t('予定はありません')}</p>
      ) : (
        <ul className="rounded-md border border-border-hairline bg-surface-raised px-3">
          {dayEvents.map((event) => (
            <EventListItem
              key={event.id}
              event={event}
              calendar={calendarById.get(event.calendarId)}
              onEdit={onEventTap}
              compact
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onAddEvent}
        className="mt-2 min-h-11 w-full rounded-sm border border-dashed border-accent px-4 text-body text-accent"
      >
        {t('＋ この日に予定を追加')}
      </button>

      <DayPhotoSection date={date} suspended={photosSuspended} userId={userId} />
    </section>
  );
  return onDayShift ? <SwipeSurface onSwipe={onDayShift}>{body}</SwipeSurface> : body;
}
