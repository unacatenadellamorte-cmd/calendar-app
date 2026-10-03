import { initLanguage } from '@/i18n';
import { isAccountDataBlocked } from '@/data/account-deletion-state';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initBackground } from '@/features/settings/model/backgroundImage';
import { initTheme } from '@/features/settings/model/useTheme';
import { initMonthEventSize } from '@/features/settings/model/monthEventSize';
import { AuthProvider } from '@/app/AuthProvider';
import { AppRoutes } from '@/app/routes';
import { DeepLinkListener } from '@/app/DeepLinkListener';
import { DeviceSyncOnResume } from '@/app/DeviceSyncOnResume';
import { WidgetSync } from '@/app/WidgetSync';
import { PurchasesSync } from '@/app/PurchasesSync';
import { cleanupNativeServiceWorker } from '@/platform/nativeServiceWorkerCleanup';
// Supabase クライアントの初期化(モジュール副作用)。未設定なら警告が1行出るだけ。
import '@/data/supabase';
import './styles/global.css';

// 保存済みのテーマ選択を、最初のレンダリング前に DOM へ反映する。
initLanguage();
initTheme();
initMonthEventSize();
if (!isAccountDataBlocked()) void initBackground();
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root が見つかりません');
}
const appRoot = rootEl;

async function startApp() {
  try {
    await cleanupNativeServiceWorker();
  } catch (error) {
    // 掃除に失敗しても画面は起動し、マーカーを残さず次回起動で再試行する。
    console.warn('[calendar-app] 旧Service Workerの掃除に失敗しました。', error);
  }
  createRoot(appRoot).render(
    <StrictMode>
      <AuthProvider>
        <PurchasesSync />
        <BrowserRouter>
          <AppRoutes />
          <DeepLinkListener />
          <DeviceSyncOnResume />
          <WidgetSync />
        </BrowserRouter>
      </AuthProvider>
    </StrictMode>,
  );
}

void startApp();
