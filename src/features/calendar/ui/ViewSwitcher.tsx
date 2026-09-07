import type { ViewMode } from '@/features/calendar/model/useCalendarView';

interface ViewSwitcherProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

const ITEMS: { value: ViewMode; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'week', label: '週' },
  { value: 'list', label: 'リスト' },
];

/** 月 / 週 / リストのセグメント切替。 */
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
