import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initTheme } from '@/features/settings/model/useTheme';
import { AuthProvider } from '@/app/AuthProvider';
import { AppRoutes } from '@/app/routes';
import { DeepLinkListener } from '@/app/DeepLinkListener';
// Supabase クライアントの初期化(モジュール副作用)。未設定なら警告が1行出るだけ。
import '@/data/supabase';
import './styles/global.css';

// 保存済みのテーマ選択を、最初のレンダリング前に DOM へ反映する。
initTheme();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root が見つかりません');
}

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <DeepLinkListener />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
