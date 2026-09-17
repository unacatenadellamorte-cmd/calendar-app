import { getLocale } from '@/i18n';
import { t, useLanguage } from '@/i18n';
import { workedMinutes } from '@core';
import { BottomSheet } from '@/ui/BottomSheet';
import { formatYen } from '@/lib/money';
import { formatClock, formatDayTitle, localDateOf } from '@/lib/datetime';
import type { EventItem } from '@/data/events';
interface PayDetailSheetProps {
  open: boolean;
  monthLabel: string;
  amount: number;
  shifts: EventItem[];
  onClose: () => void;
}
/** 給料見込みの内訳(FR-14)。その月のシフト明細 + 合計。割増・締め日等は出さない(NFR11)。 */
export function PayDetailSheet({
  open,
  monthLabel,
  amount,
  shifts,
  onClose,
}: PayDetailSheetProps) {
  useLanguage();
  return (
    <BottomSheet open={open} title={t('{0}の給料見込み', [monthLabel])} onClose={onClose}>
      {shifts.length === 0 ? (
        <p className="text-body text-ink-secondary">
          {t('{0}のシフトはまだありません。', [monthLabel])}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shifts.map((s) => {
            const worked = s.startsAt
              ? Math.max(
                  0,
                  workedMinutes(s.startsAt, s.endsAt ?? s.startsAt, s.breakMinutes ?? 0),
                )
              : 0;
            const wage = s.hourlyWage ?? 0;
            const subtotal = Math.round((worked / 60) * wage);
            return (
              <li
                key={s.id}
                className="flex items-baseline justify-between border-b border-border-hairline pb-2 text-meta last:border-b-0"
              >
                <span className="text-ink-secondary">
                  {s.startsAt ? formatDayTitle(localDateOf(s.startsAt)) : ''}{' '}
                  <span className="tabular">
                    {s.startsAt ? formatClock(s.startsAt) : ''}–
                    {s.endsAt ? formatClock(s.endsAt) : ''}
                  </span>
                </span>
                <span className="tabular text-ink-primary">
                  {(worked / 60).toFixed(1)}h × ¥{wage.toLocaleString(getLocale())} ={' '}
                  {formatYen(subtotal)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 flex items-baseline justify-between text-body font-semibold">
        <span>{t('合計')}</span>
        <span className="tabular">{formatYen(amount)}</span>
      </p>
    </BottomSheet>
  );
}
