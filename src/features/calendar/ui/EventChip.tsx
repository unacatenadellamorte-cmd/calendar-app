import type { CSSProperties } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { formatClock } from '@/lib/datetime';

interface EventChipProps {
  event: EventItem;
  calendar: Calendar | undefined;
  onTap: (event: EventItem) => void;
  /** タイムライン配置用の絶対座標(週ビュー)。省略時は通常フロー(月ビュー)。 */
  style?: CSSProperties;
  /** true でタイトルを折り返す(週ビューの縦長チップ)。既定は1行省略。 */
  wrap?: boolean;
}

/**
 * 予定チップ。カレンダーの色バー(色だけで意味を運ばないため name/time と併用)+ 時刻 + タイトル。
 * 月ビューと週ビューで共有する。
 */
export function EventChip({ event, calendar, onTap, style, wrap = false }: EventChipProps) {
  const time = event.allDay ? '終日' : event.startsAt ? formatClock(event.startsAt) : '';
  const color = calendar?.color ?? 'var(--color-ink-disabled)';
  const label = [time, event.title, calendar?.name].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap(event);
      }}
      style={{ ...style, borderColor: color }}
      aria-label={label}
      title={calendar ? `${event.title} ・ ${calendar.name}` : event.title}
      className={[
        'flex w-full items-baseline gap-1 overflow-hidden rounded-sm border-l-[3px]',
        'bg-surface-raised px-1.5 py-0.5 text-left text-meta text-ink-primary',
      ].join(' ')}
    >
      {time && <span className="flex-none tabular text-ink-secondary">{time}</span>}
      <span className={wrap ? 'min-w-0' : 'truncate'}>{event.title}</span>
    </button>
  );
}
