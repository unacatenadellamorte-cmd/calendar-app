import { t, useLanguage } from '@/i18n';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
interface Tab {
  to: string;
  label: string;
  icon: ReactNode;
}
/** 線画アイコン。色は currentColor、太さと端は .app-tab-icon で統一。 */
const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" className="app-tab-icon" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
const HOME_ICON = icon(
  <>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </>,
);
const CALENDAR_ICON = icon(
  <>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </>,
);
const SETTINGS_ICON = icon(
  <>
    <path d="M5 7h9M18 7h1M5 17h1M10 17h9" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </>,
);
const TABS: Tab[] = [
  {
    to: '/',
    get label() {
      return t('ホーム');
    },
    icon: HOME_ICON,
  },
  {
    to: '/calendar',
    get label() {
      return t('カレンダー');
    },
    icon: CALENDAR_ICON,
  },
  {
    to: '/settings',
    get label() {
      return t('設定');
    },
    icon: SETTINGS_ICON,
  },
];
/**
 * 下タブバー(ホーム / カレンダー / 設定)。ドロワー・ハンバーガーは使わない。
 * タブは横並びのリンク。キーボードで移動でき、フォーカスリングを消さない。
 * タップターゲットは 44px 以上。
 */
export function BottomTabs() {
  useLanguage();
  return (
    <nav
      aria-label={t('メインナビゲーション')}
      data-edit-id="bottom-tabs"
      className="app-bottom-tabs fixed inset-x-0 bottom-0 z-10 flex border-t border-border-hairline bg-surface-base"
      style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))' }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            [
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-meta',
              isActive ? 'font-semibold' : '',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true" className="flex h-6 items-center justify-center leading-none">
                {tab.icon}
              </span>
              <span className="tracking-wide">{tab.label}</span>
              {isActive && <span className="sr-only">{t('(選択中)')}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
