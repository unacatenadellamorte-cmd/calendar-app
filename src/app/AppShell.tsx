import { Outlet } from 'react-router-dom';
import { BottomTabs } from './BottomTabs';

/**
 * アプリシェル。単一カラム。現在のルートの画面を Outlet に描画し、
 * 下タブバーを常時表示する。
 */
export function AppShell() {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl bg-surface-sunken">
      <Outlet />
      <BottomTabs />
    </div>
  );
}
