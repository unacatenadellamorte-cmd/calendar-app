import type { ViewMode } from '@/features/calendar/model/useCalendarView';

interface ViewSwitcherProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

const ITEMS: { value: ViewMode; label: string }[] = [
  { value: 'year', label: '年' },
  { value: 'month', label: '月' },
  // 内部値は 'week' のまま(WeekView.tsx/ルーティング/localStorage永続キー等を変更しない、
  // 表示ラベルのみの修正)。WeekView.tsx は実際には cursor 当日の1日タイムライン(v1既知の
  // 簡略化)なので、ラベルを実態に合わせて「日」にする。
  { value: 'week', label: '日' },
  { value: 'list', label: 'リスト' },
];

/** 年 / 月 / 日 / リストのセグメント切替(内部値は 'week' のまま、表示ラベルのみ「日」)。 */
export function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="表示切替"
      className="flex overflow-hidden rounded-sm border border-border-hairline text-meta"
    >
      {ITEMS.map(({ value, label }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(value)}
            className={[
              'min-h-11 px-3',
              active ? 'bg-accent-weak font-semibold text-accent' : 'text-ink-secondary',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
