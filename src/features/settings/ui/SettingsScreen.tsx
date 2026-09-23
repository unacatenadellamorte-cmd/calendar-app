import { t, useLanguage } from '@/i18n';
import { BackgroundSection } from './BackgroundSection';
import { AdsPrivacySection } from './AdsPrivacySection';
import { themePalettes, type PaletteName } from '../model/themePalettes';
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
import { ConnectionsSection } from '@/features/connections/ui/ConnectionsSection';
import { MapAppSection } from './MapAppSection';
import {
  useMonthEventSize,
  type MonthEventSize,
} from '@/features/settings/model/monthEventSize';
const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
}[] = [
  {
    value: 'system',
    get label() {
      return t('端末に合わせる');
    },
  },
  {
    value: 'light',
    get label() {
      return t('ライト');
    },
  },
  {
    value: 'dark',
    get label() {
      return t('ダーク');
    },
  },
  ...Object.entries(themePalettes).map(([value, palette]) => ({
    value: value as PaletteName,
    label: palette.label,
  })),
];
const FEATURED_COUNT_OPTIONS = Array.from(
  { length: FEATURED_COUNT_MAX - FEATURED_COUNT_MIN + 1 },
  (_, i) => FEATURED_COUNT_MIN + i,
);
const MONTH_EVENT_SIZE_OPTIONS: { value: MonthEventSize; label: string; description: string }[] = [
  { value: 'small', label: '小', description: '8px' },
  { value: 'medium', label: '中', description: '10px' },
  { value: 'large', label: '大', description: '12px' },
];
export function SettingsScreen() {
  useLanguage();
  const { theme, setTheme } = useTheme();
  const featuredCount = useFeaturedCount();
  const { monthEventSize, setMonthEventSize } = useMonthEventSize();
  return (
    <Screen title={t('設定')} showProfileHeader>
      <section aria-labelledby="theme-heading" className="mt-2">
        <h2 id="theme-heading" className="text-body font-semibold text-ink-primary">
          {t('テーマ')}
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
                <span className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex gap-1">
                    {(opt.value in themePalettes
                      ? themePalettes[opt.value as PaletteName].colors
                          .slice(0, 3)
                          .concat([themePalettes[opt.value as PaletteName].colors[6]])
                      : opt.value === 'dark'
                        ? ['#16181c', '#6aa0ff', '#e6e8eb']
                        : ['#ffffff', '#2563eb', '#eaf1ff']
                    ).map((color, index) => (
                      <span
                        key={index}
                        className="h-4 w-4 rounded-full border border-border-hairline"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  {t(opt.label)}
                </span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <BackgroundSection />

      <section aria-labelledby="month-event-size-heading" className="mt-6">
        <h2 id="month-event-size-heading" className="text-body font-semibold text-ink-primary">
          {t('月予定の文字サイズ')}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="month-event-size-heading"
          className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised"
        >
          {MONTH_EVENT_SIZE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={monthEventSize === option.value}
              onClick={() => setMonthEventSize(option.value)}
              className={[
                'flex min-h-11 w-full items-center justify-between px-4 text-left text-body',
                index > 0 ? 'border-t border-border-hairline' : '',
                monthEventSize === option.value ? 'text-accent' : 'text-ink-primary',
              ].join(' ')}
            >
              <span>{t(option.label)}</span>
              <span className="text-meta text-ink-secondary">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="featured-count-heading" className="mt-6">
        <h2 id="featured-count-heading" className="text-body font-semibold text-ink-primary">
          {t('ホームに出す予定の数')}
        </h2>
        <p className="mt-1 text-meta text-ink-secondary">
          {t('コンパクトビューに表示する、この後の代表予定の件数')}
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
                <span>{t('{0} 件', [n])}</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <AccountSection />

      <ConnectionsSection />

      <MapAppSection />

      <section className="mt-6 flex flex-col gap-2">
        <Link
          to="/profile"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          {t('プロフィール')}
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
        <Link
          to="/calendars"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          {t('カレンダーの並び順')}
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
        <Link
          to="/shift-templates"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          {t('お気に入りシフト')}
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
        <Link
          to="/secret-mode"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
        >
          {t('シークレットモード')}
          <span aria-hidden="true" className="text-ink-secondary">
            ›
          </span>
        </Link>
      </section>

      <DataSection />
      <AdsPrivacySection />
    </Screen>
  );
}
