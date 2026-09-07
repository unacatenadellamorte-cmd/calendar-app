import { Link } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useTheme, type ThemePreference } from '@/features/settings/model/useTheme';
import { AccountSection } from './AccountSection';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '端末に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();

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

      <AccountSection />

      <section className="mt-6">
        <Link
          to="/calendars"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          カレンダー管理
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
      </section>

      <p className="mt-6 text-meta text-ink-secondary">
        データのエクスポート・カレンダー接続は後続ストーリーでここに追加されます。
      </p>
    </Screen>
  );
}
