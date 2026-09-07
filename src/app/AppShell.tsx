import { Outlet } from 'react-router-dom';
import { BottomTabs } from './BottomTabs';
import { OnlineProvider } from './OnlineProvider';
import { ConnectivityBar } from './ConnectivityBar';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

/**
 * アプリシェル。単一カラム。接続状態バーを最上部に、現在ルートの画面を Outlet に、
 * 下タブバーを常時表示。SW 更新プロンプトは最前面に浮かせる。
 */
export function AppShell() {
  return (
    <OnlineProvider>
      <div className="mx-auto min-h-[100dvh] w-full max-w-2xl bg-surface-sunken">
        <ConnectivityBar />
        <Outlet />
        <BottomTabs />
        <PwaUpdatePrompt />
      </div>
    </OnlineProvider>
  );
}
