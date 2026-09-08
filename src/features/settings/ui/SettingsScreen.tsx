import { Link } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useTheme, type ThemePreference } from '@/features/settings/model/useTheme';
import {
  FEATURED_COUNT_MAX,
  FEATURED_COUNT_MIN,
  setFeaturedCount,
  useFeaturedCount,
} from '@/features/compact/model/featuredCount';
import { AccountSection } from './AccountSection';
import { DataSection } from './DataSection';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '端末に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];

const FEATURED_COUNT_OPTIONS = Array.from(
  { length: FEATURED_COUNT_MAX - FEATURED_COUNT_MIN + 1 },
  (_, i) => FEATURED_COUNT_MIN + i,
);

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const featuredCount = useFeaturedCount();

  return (
    <Screen title="設定">
      <section aria-labelledby="theme-heading" className="mt-2">
        <h2 id="theme-heading" className="text-body font-semibold text-ink-primary">
          テーマ
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="theme-heading"
          className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised"
        >
          {THEME_OPTIONS.map((opt, i) => {
            const selected = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(opt.value)}
                className={[
                  'flex min-h-11 w-full items-center justify-between px-4 text-left text-body',
                  i > 0 ? 'border-t border-border-hairline' : '',
                  selected ? 'text-accent' : 'text-ink-primary',
                ].join(' ')}
              >
                <span>{opt.label}</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="featured-count-heading" className="mt-6">
        <h2 id="featured-count-heading" className="text-body font-semibold text-ink-primary">
          ホームに出す予定の数
        </h2>
        <p className="mt-1 text-meta text-ink-secondary">
          コンパクトビューに表示する、この後の代表予定の件数
        </p>
        <div
          role="radiogroup"
          aria-labelledby="featured-count-heading"
          className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised"
        >
          {FEATURED_COUNT_OPTIONS.map((n, i) => {
            const selected = featuredCount === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFeaturedCount(n)}
                className={[
                  'flex min-h-11 w-full items-center justify-between px-4 text-left text-body',
                  i > 0 ? 'border-t border-border-hairline' : '',
                  selected ? 'text-accent' : 'text-ink-primary',
                ].join(' ')}
              >
                <span>{n} 件</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <AccountSection />

      <section className="mt-6 flex flex-col gap-2">
        <Link
          to="/calendars"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          カレンダー管理
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
        <Link
          to="/shift-templates"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          お気に入りシフト
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
      </section>

      <DataSection />

      <p className="mt-6 text-meta text-ink-secondary">
        カレンダー接続は後続ストーリーでここに追加されます。
      </p>
    </Screen>
  );
}
