import { t, useLanguage } from '@/i18n';
import type { Calendar } from '@/data/calendars';
interface CalendarRowProps {
  calendar: Calendar;
  /** 1 起点の順位。 */
  rank: number;
  total: number;
  onEdit: (calendar: Calendar) => void;
  onToggleVisible: (calendar: Calendar) => void;
  onMove: (calendar: Calendar, dir: 'up' | 'down') => void;
  /** デスクトップのドラッグ用。 */
  onDragStartRow: (id: string) => void;
  onDropRow: (targetId: string) => void;
  dragging: boolean;
  /** 直近の取り込み失敗(Story 3.4)。あれば警告行 + 再試行を出す(google のみ)。 */
  syncError?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}
const SOURCE_LABEL: Record<Calendar['source'], string> = {
  get local() {
    return t('ローカル');
  },
  google: 'Google',
  get device() {
    return t('端末');
  },
};
/**
 * カレンダー管理画面の1行。順位 + ドラッグハンドル + 色ドット + 名前 + source + ▲▼ + 表示トグル。
 * 主経路は ▲▼(キーボード / スクリーンリーダーで完結)。ドラッグはデスクトップの補助(Story 2.1)。
 */
export function CalendarRow({
  calendar,
  rank,
  total,
  onEdit,
  onToggleVisible,
  onMove,
  onDragStartRow,
  onDropRow,
  dragging,
  syncError,
  onRetry,
  retrying,
}: CalendarRowProps) {
  useLanguage();
  const showSyncError = calendar.source === 'google' && Boolean(syncError);
  return (
    <li
      draggable
      onDragStart={(e) => {
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        onDragStartRow(calendar.id);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropRow(calendar.id);
      }}
      className={[
        'border-b border-border-hairline last:border-b-0',
        dragging ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1 px-1">
        <span
          aria-hidden="true"
          className="w-5 flex-none text-center text-meta tabular text-ink-secondary"
        >
          {rank}
        </span>
        <span
          aria-hidden="true"
          className="flex-none cursor-grab select-none text-ink-disabled"
        >
          ⋮⋮
        </span>

        <button
          type="button"
          onClick={() => onEdit(calendar)}
          className="flex min-h-14 flex-1 items-center gap-3 pr-1 text-left"
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
                <span className="ml-2 text-meta text-ink-secondary">{t('シフト用')}</span>
              )}
            </span>
            <span className="block text-meta text-ink-secondary">
              <span className="sr-only">{t('優先度 {0}/{1}、', [rank, total])}</span>
              {SOURCE_LABEL[calendar.source]}
            </span>
          </span>
        </button>

        <span className="flex flex-none flex-col">
          <button
            type="button"
            onClick={() => onMove(calendar, 'up')}
            disabled={rank === 1}
            aria-label={t('「{0}」を上へ', [calendar.name])}
            className="flex h-11 w-9 items-center justify-center text-meta text-ink-secondary disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(calendar, 'down')}
            disabled={rank === total}
            aria-label={t('「{0}」を下へ', [calendar.name])}
            className="flex h-11 w-9 items-center justify-center text-meta text-ink-secondary disabled:opacity-30"
          >
            ▼
          </button>
        </span>

        <label className="flex min-h-11 flex-none items-center gap-2 pl-1 pr-1">
          <span className="sr-only">{t('{0} を表示', [calendar.name])}</span>
          <input
            type="checkbox"
            checked={calendar.isVisible}
            onChange={() => onToggleVisible(calendar)}
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
        </label>
      </div>

      {showSyncError && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pl-8">
          <span className="text-meta text-danger">{t('取り込めませんでした')}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="h-11 shrink-0 px-2 text-meta text-accent disabled:opacity-50"
            >
              {retrying ? t('取り込み中…') : t('再試行')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
