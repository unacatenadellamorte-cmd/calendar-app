import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
  /** 月表示では件名を優先し、時刻は読み上げと詳細だけに残す。 */
  showTime?: boolean;
  /** 月表示の狭いセル向け。件名が収まらないときだけ横に流す。 */
  month?: boolean;
}
/**
 * 予定チップ。カレンダーの色バー(色だけで意味を運ばないため name/time と併用)+ 時刻 + タイトル。
 * 月ビューと週ビューで共有する。
 */
export function EventChip({
  event,
  calendar,
  onTap,
  style,
  wrap = false,
  showTime = true,
  month = false,
}: EventChipProps) {
  useLanguage();
  const titleViewportRef = useRef<HTMLSpanElement>(null);
  const titleTextRef = useRef<HTMLSpanElement>(null);
  const [marqueeDistance, setMarqueeDistance] = useState(0);
  const time = event.allDay ? t('終日') : event.startsAt ? formatClock(event.startsAt) : '';
  const color = calendar?.color ?? 'var(--color-ink-disabled)';
  const label = [time, event.title, calendar?.name].filter(Boolean).join(' ');
  const marqueeDuration = Math.max(4, Math.min(14, 4 + marqueeDistance * 0.055));
  useEffect(() => {
    if (!month) return;
    const viewport = titleViewportRef.current;
    const text = titleTextRef.current;
    if (!viewport || !text) return;
    const measure = () => {
      const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
      setMarqueeDistance(distance);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    observer?.observe(text);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [event.title, month]);
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
        month
          ? 'month-event-chip bg-surface-raised px-0 py-0 text-left text-[0.5rem] leading-tight text-ink-primary'
          : 'bg-surface-raised px-1.5 py-0.5 text-left text-meta text-ink-primary',
      ].join(' ')}
    >
      {showTime && time && (
        <span className="flex-none tabular text-ink-secondary">{time}</span>
      )}
      {month ? (
        <span
          ref={titleViewportRef}
          className={['month-event-title', marqueeDistance > 0 ? 'is-marquee' : ''].join(' ')}
          style={
            {
              '--month-marquee-distance': `${marqueeDistance}px`,
              '--month-marquee-duration': `${marqueeDuration}s`,
            } as CSSProperties
          }
        >
          <span ref={titleTextRef}>{event.title}</span>
        </span>
      ) : (
        <span className={wrap ? 'min-w-0' : 'truncate'}>{event.title}</span>
      )}
    </button>
  );
}
