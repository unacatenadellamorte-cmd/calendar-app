import { t, useLanguage } from '@/i18n';
import { NavLink } from 'react-router-dom';
interface Tab {
  to: string;
  label: string;
  icon: string;
}
const TABS: Tab[] = [
  {
    to: '/',
    get label() {
      return t('ホーム');
    },
    icon: '▦',
  },
  {
    to: '/calendar',
    get label() {
      return t('カレンダー');
    },
    icon: '▤',
  },
  {
    to: '/settings',
    get label() {
      return t('設定');
    },
    icon: '⚙',
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
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border-hairline bg-surface-base pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            [
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-meta',
              isActive ? 'text-accent' : 'text-ink-disabled',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {isActive && <span className="sr-only">{t('(選択中)')}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
