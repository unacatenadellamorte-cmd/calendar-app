import { useContext, type ReactNode } from 'react';
import { ProfileHeaderContext } from './profile-header-context';

interface ScreenProps {
  title: string;
  /** 主要画面の共通ヘッダーに置くプロフィールアイコン。 */
  avatar?: ReactNode;
  /** プロフィールヘッダーを表示する主要3画面だけ true にする。 */
  showProfileHeader?: boolean;
  /** 見出し右の補助アクション(任意)。 */
  action?: ReactNode;
  /** 画面ごとの本文余白。月カレンダーは左右8pxに詰める。 */
  mainClassName?: string;
  /** リストの上部操作を残し、本文を画面内に収める。 */
  contained?: boolean;
  children?: ReactNode;
}

/**
 * 画面の共通スキャフォールド。スマホ縦・単一カラム。
 * 見出しバー + 縦スクロールする本文。下タブの高さぶんの余白を確保する。
 */
export function Screen({
  title,
  avatar,
  showProfileHeader = false,
  action,
  mainClassName,
  contained = false,
  children,
}: ScreenProps) {
  const contextAvatar = useContext(ProfileHeaderContext);
  const profileHeader = showProfileHeader ? (avatar ?? contextAvatar) : null;
  return (
    <div
      className={`app-screen flex min-h-[100dvh] flex-col bg-surface-sunken${contained ? ' app-screen-contained' : ''}`}
    >
      <header
        data-edit-id="screen-header"
        className="screen-header flex min-h-14 items-center justify-between rounded-b-md px-4 py-1"
      >
        <div className="screen-heading-group">
          {profileHeader}
          <h1
            data-edit-id="screen-title"
            className="text-title font-semibold text-ink-primary"
          >
            {title}
          </h1>
        </div>
        {action && <div className="screen-actions">{action}</div>}
      </header>
      <main
        data-edit-id="screen-main"
        className={['flex-1 overflow-y-auto px-4 pb-24', mainClassName]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </main>
    </div>
  );
}
