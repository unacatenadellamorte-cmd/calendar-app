import type { Calendar } from '@/data/calendars';

interface CalendarRowProps {
  calendar: Calendar;
  onEdit: (calendar: Calendar) => void;
  onToggleVisible: (calendar: Calendar) => void;
}

const SOURCE_LABEL: Record<Calendar['source'], string> = {
  local: 'ローカル',
  google: 'Google',
};

/**
 * カレンダー管理画面の1行。色ドット + 名前 + source ラベル + 表示トグル。
 * 優先度番号・ドラッグハンドルは Story 2.1 で追加する。
 */
export function CalendarRow({ calendar, onEdit, onToggleVisible }: CalendarRowProps) {
  return (
    <li className="flex items-center gap-3 border-b border-border-hairline last:border-b-0">
      <button
        type="button"
        onClick={() => onEdit(calendar)}
        className="flex min-h-14 flex-1 items-center gap-3 pr-2 text-left"
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-none rounded-[3px]"
          style={{ backgroundColor: calendar.color }}
        />
        <span className="min-w-0">
          <span className="block truncate text-body text-ink-primary">
            {calendar.name}
            {calendar.isShift && (
              <span className="ml-2 text-meta text-ink-secondary">シフト用</span>
            )}
          </span>
          <span className="block text-meta text-ink-secondary">
            {SOURCE_LABEL[calendar.source]}
          </span>
        </span>
      </button>

      <label className="flex min-h-11 flex-none items-center gap-2 pl-1 pr-1">
        <span className="sr-only">{calendar.name} を表示</span>
        <input
          type="checkbox"
          checked={calendar.isVisible}
          onChange={() => onToggleVisible(calendar)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
      </label>
    </li>
  );
}
