import { t, useLanguage, weekdayLabels } from '@/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { monthGridDays, weekRowOf, ymd, type DayCell } from '@/lib/calendar-view';
import { EventChip } from './EventChip';
import { MonthSlide } from './MonthSlide';
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
  collapsedToWeekOf,
  onBackToMonth,
  onSwipeLeft,
  onSwipeRight,
}: MonthViewProps) {
  useLanguage();
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
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swipeAxis = useRef<'x' | 'y' | null>(null);
  // スワイプ検出
  const touchStartRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const lastTap = useRef<{ date: string; x: number; y: number; time: number } | null>(null);
  const doubleTapRef = useRef(onDayDoubleTap);
  doubleTapRef.current = onDayDoubleTap;
  const cancelHold = () => {
    if (holdRef.current !== null) clearTimeout(holdRef.current);
    holdRef.current = null;
    holdStartRef.current = null;
  };
  useEffect(() => cancelHold, [cursor]);
  useEffect(() => {
    // 長押しで週へ折りたたむと、指の下に別の予定ボタンが移動してくる。
    // そのためセル内だけでなく、画面全体で直後のクリックを一度抑止する。
    const suppressClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const reset = () => {
      suppressClickRef.current = false;
    };
    // 1回目のタップで週へ折りたたまれても、同じ位置の2回目を元の日付へ渡す。
    const secondTap = (event: PointerEvent) => {
      const previous = lastTap.current;
      if (!previous || event.button !== 0 || !event.isPrimary) return;
      if (
        performance.now() - previous.time > 350 ||
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 24
      )
        return;
      lastTap.current = null;
      cancelHold();
      suppressClickRef.current = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      doubleTapRef.current(previous.date);
    };
    document.addEventListener('click', suppressClick, true);
    document.addEventListener('pointerdown', reset, true);
    document.addEventListener('pointerdown', secondTap, true);
    document.addEventListener('keydown', reset, true);
    return () => {
      document.removeEventListener('click', suppressClick, true);
      document.removeEventListener('pointerdown', reset, true);
      document.removeEventListener('pointerdown', secondTap, true);
      document.removeEventListener('keydown', reset, true);
    };
  }, []);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      handleTouchCancel();
      cancelHold();
      return;
    }
    swipeAxis.current = null;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    if (e.touches.length !== 1) {
      handleTouchCancel();
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!swipeAxis.current && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      lastTap.current = null;
      cancelHold();
      suppressClickRef.current = true;
    }
    if (swipeAxis.current === 'x') {
      setDragging(true);
      const width = e.currentTarget.getBoundingClientRect().width || 400;
      setDragOffset(Math.max(-width, Math.min(width, dx)));
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) {
      handleTouchCancel();
      return;
    }
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    setDragging(false);
    setDragOffset(0);
    // 横方向の移動が縦方向より大きく、かつ50px以上の場合を月送りと判定
    if (
      swipeAxis.current !== 'y' &&
      Math.abs(deltaX) > Math.abs(deltaY) &&
      Math.abs(deltaX) > 50
    ) {
      cancelHold();
      suppressClickRef.current = true;
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
    swipeAxis.current = null;
    setDragging(false);
    setDragOffset(0);
    cancelHold();
  };
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-meta text-ink-secondary">
        {weekdayLabels().map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {isCollapsed && (
        <button type="button" onClick={onBackToMonth} className="mb-1 text-meta text-accent">
          {t('月表示に戻る')}
        </button>
      )}

      <MonthSlide
        monthKey={cursor.slice(0, 7)}
        offset={dragOffset}
        dragging={dragging}
        contentVersion={byDay}
      >
        <div
          key={`${year}-${month}`}
          className="grid grid-cols-7 border-t border-l border-border-hairline touch-pan-y"
          data-testid="month-grid"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
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
                  // 予定や「他N件」の上でも、その日付の長押しとして扱う。
                  // 短いタップは子ボタンへ渡し、長押し後のクリックだけを抑止する。
                  holdStartRef.current = { x: event.clientX, y: event.clientY };
                  holdRef.current = setTimeout(() => {
                    holdRef.current = null;
                    suppressClickRef.current = true;
                    onDayLongPress?.(cell.date);
                  }, 500);
                }}
                onPointerMove={(event) => {
                  const start = holdStartRef.current;
                  if (
                    start &&
                    Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
                  ) {
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
                  } else if (
                    event.detail > 0 &&
                    (event.clientX !== 0 || event.clientY !== 0)
                  ) {
                    lastTap.current = {
                      date: cell.date,
                      x: event.clientX,
                      y: event.clientY,
                      time: performance.now(),
                    };
                  }
                }}
                onClick={() => onDayTap(cell.date)}
                className={[
                  'flex min-h-20 min-w-0 select-none flex-col gap-0.5 border-r border-b border-border-hairline p-1',
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
                  aria-label={t('{0}月{1}日を開く', [ymd(cell.date).month, cell.day])}
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
                    onTap={() => onDayTap(cell.date)}
                    showTime={false}
                  />
                ))}

                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayTap(cell.date);
                    }}
                    className="self-start px-1 text-meta text-ink-secondary"
                  >
                    {t('他 {0} 件', [overflow])}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </MonthSlide>
    </div>
  );
}
