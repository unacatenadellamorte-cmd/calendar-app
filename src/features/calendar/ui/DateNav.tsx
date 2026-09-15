import { useEffect, useRef, useState } from 'react';
import type { ViewMode } from '@/features/calendar/model/useCalendarView';
import { formatDayTitle, formatMonthTitle, formatYearTitle } from '@/lib/datetime';

interface DateNavProps {
  view: ViewMode;
  cursor: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump: (date: string) => void;
}

/**
 * 日付ナビ。`‹` `今日` `›` と、見出しタップで開く日付ジャンプ。
 * list ビューは前後ボタンを出さない(連続スクロールのため)。
 */
export function DateNav({ view, cursor, onPrev, onNext, onToday, onJump }: DateNavProps) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepping = view !== 'list';
  // week は当日1日なので日付、year は年、month / list は月。
  const title =
    view === 'week'
      ? formatDayTitle(cursor)
      : view === 'year'
        ? formatYearTitle(cursor)
        : formatMonthTitle(cursor);

  useEffect(() => {
    if (jumpOpen) inputRef.current?.focus();
  }, [jumpOpen]);

  return (
    <div className="mb-3 flex items-center gap-2">
      {stepping && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="前へ"
          className="min-h-11 min-w-11 text-ink-secondary"
        >
          ‹
        </button>
      )}

      <div className="flex flex-1 flex-col">
        <h2 className="text-title font-semibold text-ink-primary">
          <button
            type="button"
            onClick={() => setJumpOpen((v) => !v)}
            aria-expanded={jumpOpen}
            className="text-left"
          >
            {title}
          </button>
        </h2>
        {jumpOpen && (
          <input
            ref={inputRef}
            type="date"
            aria-label="日付を移動"
            value={cursor}
            onChange={(e) => {
              if (e.target.value) {
                onJump(e.target.value);
                setJumpOpen(false);
              }
            }}
            className="mt-1 min-h-11 self-start rounded-sm border border-border-hairline bg-surface-base px-2 text-body"
          />
        )}
      </div>

      <button
        type="button"
        onClick={onToday}
        className="min-h-11 rounded-sm border border-border-hairline px-3 text-meta text-ink-secondary"
      >
        今日
      </button>

      {stepping && (
        <button
          type="button"
          onClick={onNext}
          aria-label="次へ"
          className="min-h-11 min-w-11 text-ink-secondary"
        >
          ›
        </button>
      )}
    </div>
  );
}
