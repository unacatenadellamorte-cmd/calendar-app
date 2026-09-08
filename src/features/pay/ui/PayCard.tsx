import { useState } from 'react';
import { formatYen } from '@/lib/money';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { usePayEstimate } from '../model/usePayEstimate';
import { PayDetailSheet } from './PayDetailSheet';

interface PayCardProps {
  events: EventItem[];
  calendars: Calendar[];
}

/**
 * 当月の給料見込み(FR-14 / FR-15)。compact-card の下。
 * 実働時間 × 時給の暦月合計を都度計算。前月/翌月の矢印、タップで内訳。静かなトーン。
 */
export function PayCard({ events, calendars }: PayCardProps) {
  const pay = usePayEstimate(events, calendars);
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <section
      aria-label={`${pay.monthLabel}の給料見込み`}
      className="mt-3 rounded-md border border-border-hairline bg-surface-raised"
    >
      <div className="flex items-center justify-between px-4 pt-3 text-meta text-ink-secondary">
        <span>{pay.monthLabel}の給料見込み</span>
        <span className="flex gap-1">
          <button
            type="button"
            aria-label="前の月"
            onClick={pay.prev}
            className="h-11 w-9 rounded-sm border border-border-hairline text-ink-secondary"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="次の月"
            onClick={pay.next}
            disabled={!pay.canNext}
            className="h-11 w-9 rounded-sm border border-border-hairline text-ink-secondary disabled:opacity-40"
          >
            ›
          </button>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="flex w-full flex-col items-start px-4 pb-4 pt-1 text-left"
      >
        <span className="tabular text-title font-semibold text-ink-primary">
          {formatYen(pay.amount)}
        </span>
        <span className="mt-0.5 text-meta text-ink-secondary">
          {pay.shiftCount === 0
            ? `${pay.monthLabel}のシフトはまだありません`
            : `${pay.monthLabel} ・ ${pay.shiftCount}件のシフト`}
        </span>
      </button>

      <PayDetailSheet
        open={detailOpen}
        monthLabel={pay.monthLabel}
        amount={pay.amount}
        shifts={pay.shifts}
        onClose={() => setDetailOpen(false)}
      />
    </section>
  );
}
