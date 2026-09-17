import { useEffect, useMemo, useRef } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { monthGridDays, weekRowOf, ymd, type DayCell } from '@/lib/calendar-view';
import { EventChip } from './EventChip';

interface MonthViewProps {
  cursor: string;
  /** 日付("YYYY-MM-DD")→ その日の予定(優先度順)。呼び出し元(`CalendarScreen`)で計算済みのものを渡す。 */
  byDay: Map<string, EventItem[]>;
  calendarById: Map<string, Calendar>;
  today: string;
  onDayTap: (date: string) => void;
  onDayLongPress?: (date: string) => void;
  /** 日付セルのダブルタップ。その日を cursor にして「日」ビューへ切り替える呼び出し側の配線を想定。 */
  onDayDoubleTap: (date: string) => void;
  onEventTap: (event: EventItem) => void;
  onOverflowTap: (date: string) => void;
  /**
   * 指定があれば、その日を含む週の1行だけに月グリッドを折りたたむ(Option C)。
   * 指定日が現在の `cursor` の月グリッドに含まれない(月を送った等)場合はフル表示へフォールバックする。
   */
  collapsedToWeekOf?: string;
  /** 折りたたみ解除(「月表示に戻る」)。`collapsedToWeekOf` 指定時のみ使う。 */
  onBackToMonth: () => void;
  /** 左スワイプ(翌月へ)。 */
  onSwipeLeft?: () => void;
  /** 右スワイプ(前月へ)。 */
  onSwipeRight?: () => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_CHIPS = 3;

/** 月ビュー。7列グリッド、セル内は優先度順に最大3件 +「他 N 件」。 */
export function MonthView({
  cursor,
  byDay,
  calendarById,
  today,
  onDayTap,
  onDayLongPress,
  onDayDoubleTap,
  onEventTap,
  onOverflowTap,
  collapsedToWeekOf,
  onBackToMonth,
  onSwipeLeft,
  onSwipeRight,
}: MonthViewProps) {
  const { year, month } = ymd(cursor);
  const allCells = useMemo(() => monthGridDays(year, month, today), [year, month, today]);
  const weekCells: DayCell[] | null = useMemo(
    () => (collapsedToWeekOf ? weekRowOf(allCells, collapsedToWeekOf) : null),
    [allCells, collapsedToWeekOf],
  );
  // 折りたたみ対象日が現在の月グリッドに無ければ(例: 折りたたみ中に月を送った)フル表示へ戻す。
  // (`CalendarScreen` 側でも `selectedDay` を同じ条件で一律にクリアするが、
  // ここでの防御を残すことで、そのクリアが反映されるまでの1フレームも壊れた表示にしない。)
  const isCollapsed = Boolean(weekCells && weekCells.length > 0);
  const cells = isCollapsed ? (weekCells as DayCell[]) : allCells;

  // スワイプ検出
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const cancelHold = () => {
    if (holdRef.current !== null) clearTimeout(holdRef.current);
    holdRef.current = null;
    holdStartRef.current = null;
  };
  useEffect(() => cancelHold, [cursor]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // 横方向の移動が縦方向より大きく、かつ50px以上の場合を月送りと判定
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // 右スワイプ(前月へ)
        onSwipeRight?.();
      } else {
        // 左スワイプ(翌月へ)
        onSwipeLeft?.();
      }
    }
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
  };

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-meta text-ink-secondary">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {isCollapsed && (
        <button
          type="button"
          onClick={onBackToMonth}
          className="mb-1 text-meta text-accent"
        >
          月表示に戻る
        </button>
      )}

      <div
        key={`${year}-${month}`}
        className="grid grid-cols-7 border-t border-l border-border-hairline animate-[slide-fade_200ms_ease-out]"
        data-testid="month-grid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {cells.map((cell) => {
          const dayEvents = byDay.get(cell.date) ?? [];
          const shown = dayEvents.slice(0, MAX_CHIPS);
          const overflow = dayEvents.length - shown.length;

          return (
            <div
              key={cell.date}
              onPointerDown={(event) => {
                cancelHold();
                suppressClickRef.current = false;
                if (event.button !== 0 || !event.isPrimary) return;
                const button = (event.target as HTMLElement).closest('button');
                if (button && !button.hasAttribute('data-day-button')) return;
                holdStartRef.current = { x: event.clientX, y: event.clientY };
                holdRef.current = setTimeout(() => {
                  holdRef.current = null;
                  suppressClickRef.current = true;
                  onDayLongPress?.(cell.date);
                }, 500);
              }}
              onPointerMove={(event) => {
                const start = holdStartRef.current;
                if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
                  cancelHold();
                  suppressClickRef.current = true;
                }
              }}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onPointerLeave={cancelHold}
              onContextMenu={(event) => event.preventDefault()}
              onClickCapture={(event) => {
                if (suppressClickRef.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressClickRef.current = false;
                }
              }}
              onClick={() => onDayTap(cell.date)}
              className={[
                'flex min-h-20 select-none flex-col gap-0.5 border-r border-b border-border-hairline p-1',
                cell.inMonth ? 'bg-surface-base' : 'bg-surface-sunken',
                cell.date === cursor ? 'ring-2 ring-inset ring-accent' : '',
              ].join(' ')}
            >
              <button
                type="button"
                data-day-button
                aria-pressed={cell.date === cursor}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.shiftKey) {
                    event.preventDefault();
                    onDayLongPress?.(cell.date);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDayTap(cell.date);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onDayDoubleTap(cell.date);
                }}
                aria-label={`${ymd(cell.date).month}月${cell.day}日を開く`}
                className={[
                  // touch-manipulation: iOS Safari 等でダブルタップがブラウザのズームジェスチャーと
                  // 衝突しないよう、このボタン上ではダブルタップジェスチャーをズームに回さない。
                  'touch-manipulation self-start rounded-full px-1 text-meta tabular',
                  cell.isToday
                    ? 'bg-accent font-semibold text-on-accent'
                    : cell.inMonth
                      ? 'text-ink-secondary'
                      : 'text-ink-disabled',
                ].join(' ')}
              >
                {cell.day}
              </button>

              {shown.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  calendar={calendarById.get(event.calendarId)}
                  onTap={onEventTap}
                />
              ))}

              {overflow > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOverflowTap(cell.date);
                  }}
                  className="self-start px-1 text-meta text-ink-secondary"
                >
                  他 {overflow} 件
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
