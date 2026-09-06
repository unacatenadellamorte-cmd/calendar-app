import { useRoutes, type RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomeScreen } from '@/features/home/ui/HomeScreen';
import { CalendarScreen } from '@/features/calendar/ui/CalendarScreen';
import { SettingsScreen } from '@/features/settings/ui/SettingsScreen';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'calendar', element: <CalendarScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
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
