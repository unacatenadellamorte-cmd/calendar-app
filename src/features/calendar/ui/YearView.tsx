import { getLocale } from '@/i18n';
import { t, useLanguage, weekdayLabels } from '@/i18n';
import { useMemo } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { groupEventsByDay, makePriorityOf, monthGridDays, ymd } from '@/lib/calendar-view';
import { formatMonthTitle } from '@/lib/datetime';
interface YearViewProps {
  cursor: string;
  events: EventItem[];
  calendarById: Map<string, Calendar>;
  today: string;
  /** 月見出しタップ。その月1日を cursor にして月ビューへ。 */
  onMonthTap: (date: string) => void;
  /** 日付セルタップ。その日を cursor にして月ビューへ。 */
  onDayTap: (date: string) => void;
}
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
/**
 * 年ビュー。cursor の年の1〜12月ぶん、既存の `monthGridDays`(日曜始まり)のミニグリッドを縦1列に並べる。
 * 予定は月ビューと同じ優先度規則で日ごとに1件へ代表させ、その色のドットだけを表示する
 * (タイトル・時刻はスペースが無いため出さない。詳細は月見出し/日付タップで月ビューへ)。
 *
 * 月境界のはみ出し日(前後月の inMonth: false セル)は、その実体(inMonth: true)を
 * 隣の月グリッドが別途持つため、タップ可能にせず非インタラクティブに描画する
 * (12ヶ月ぶん独立に monthGridDays を呼ぶ都合上、同じ日付のボタンが重複してしまうのを避ける)。
 */
export function YearView({
  cursor,
  events,
  calendarById,
  today,
  onMonthTap,
  onDayTap,
}: YearViewProps) {
  useLanguage();
  const { year } = ymd(cursor);
  // セル内の1件代表選抜は月ビューと同じ優先度順(Story 2.3 の規則を再利用、年ビュー独自ルールは作らない)。
  const priorityOf = useMemo(() => makePriorityOf(calendarById), [calendarById]);
  const byDay = useMemo(() => groupEventsByDay(events, priorityOf), [events, priorityOf]);
  // 12ヶ月ぶんのグリッド計算(最大504セル)はメモ化する(MonthView と同じ流儀)。
  const monthsData = useMemo(
    () => MONTHS.map((month) => ({ month, cells: monthGridDays(year, month, today) })),
    [year, today],
  );
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-meta text-ink-secondary">
        {weekdayLabels().map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {monthsData.map(({ month, cells }) => {
          const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
          return (
            <div key={month}>
              <button
                type="button"
                onClick={() => onMonthTap(monthStart)}
                aria-label={formatMonthTitle(monthStart)}
                className="mb-1 text-body font-semibold text-ink-primary"
              >
                {new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(
                  new Date(year, month - 1, 1),
                )}
              </button>

              <div className="grid grid-cols-7 border-t border-l border-border-hairline">
                {cells.map((cell) => {
                  const topEvent = byDay.get(cell.date)?.[0];
                  const dotColor = topEvent
                    ? (calendarById.get(topEvent.calendarId)?.color ??
                      'var(--color-ink-disabled)')
                    : undefined;
                  const cellYmd = ymd(cell.date);
                  const dayNumber = (
                    <span
                      className={[
                        'text-meta tabular',
                        cell.isToday
                          ? 'rounded-full bg-accent px-1 font-semibold text-on-accent'
                          : cell.inMonth
                            ? 'text-ink-secondary'
                            : 'text-ink-disabled',
                      ].join(' ')}
                    >
                      {cell.day}
                    </span>
                  );
                  const dot = topEvent && (
                    <span
                      aria-hidden="true"
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                  );
                  const cellClassName = [
                    'flex min-h-11 flex-col items-center justify-center gap-0.5 border-r border-b border-border-hairline',
                    cell.inMonth ? 'bg-surface-base' : 'bg-surface-sunken',
                  ].join(' ');
                  if (!cell.inMonth) {
                    // はみ出し日。実体(inMonth: true)は隣の月グリッドにある。見た目だけ維持し非インタラクティブに。
                    return (
                      <div key={cell.date} aria-hidden="true" className={cellClassName}>
                        {dayNumber}
                        {dot}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => onDayTap(cell.date)}
                      aria-label={t('{0}年{1}月{2}日を開く{3}', [
                        cellYmd.year,
                        cellYmd.month,
                        cellYmd.day,
                        topEvent ? t('(予定あり)') : '',
                      ])}
                      className={cellClassName}
                    >
                      {dayNumber}
                      {dot}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
