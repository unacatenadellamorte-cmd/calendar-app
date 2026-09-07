import { useRoutes, type RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomeScreen } from '@/features/home/ui/HomeScreen';
import { CalendarScreen } from '@/features/calendar/ui/CalendarScreen';
import { SettingsScreen } from '@/features/settings/ui/SettingsScreen';
import { AuthScreen } from '@/features/auth/ui/AuthScreen';
import { CalendarsScreen } from '@/features/calendars/ui/CalendarsScreen';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'calendar', element: <CalendarScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      // タブ外。設定のアカウント欄から遷移する。
      { path: 'auth', element: <AuthScreen /> },
      // タブ外。ホーム見出しと設定から遷移する。
      { path: 'calendars', element: <CalendarsScreen /> },
    ],
  },
];

/**
 * ルート設定を宣言的にレンダリングする。`<BrowserRouter>` / `<MemoryRouter>` の内側で使う。
 * data router(createBrowserRouter)を使わないので、テストで loader 用の fetch 機構を回避できる。
 */
export function AppRoutes() {
  return useRoutes(routes);
}
