import { useRoutes, useSearchParams, type RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomeScreen } from '@/features/home/ui/HomeScreen';
import { CalendarScreen } from '@/features/calendar/ui/CalendarScreen';
import { SettingsScreen } from '@/features/settings/ui/SettingsScreen';
import { AuthScreen } from '@/features/auth/ui/AuthScreen';
import { CalendarsScreen } from '@/features/calendars/ui/CalendarsScreen';
import { ShiftTemplatesScreen } from '@/features/shifts/ui/ShiftTemplatesScreen';
import { GoogleCallbackScreen } from '@/features/connections/ui/GoogleCallbackScreen';
import { GoogleCalendarPicker } from '@/features/connections/ui/GoogleCalendarPicker';

/** `/calendar?date=YYYY-MM-DD`(ホームの代表予定タップ等)を CalendarScreen に渡す。 */
function CalendarRoute() {
  const [params] = useSearchParams();
  const raw = params.get('date');
  // 手書き URL 等の不正値でカレンダー描画が壊れないよう、暦日の形だけ通す。
  const initialDate = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
  return <CalendarScreen initialDate={initialDate} />;
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'calendar', element: <CalendarRoute /> },
      { path: 'settings', element: <SettingsScreen /> },
      // タブ外。設定のアカウント欄から遷移する。
      { path: 'auth', element: <AuthScreen /> },
      // タブ外。ホーム見出しと設定から遷移する。
      { path: 'calendars', element: <CalendarsScreen /> },
      // タブ外。設定から遷移する。
      { path: 'shift-templates', element: <ShiftTemplatesScreen /> },
      // タブ外。Google OAuth のリダイレクト先(Story 3.1)。
      { path: 'connections/google/callback', element: <GoogleCallbackScreen /> },
      // タブ外。設定の接続欄から遷移(Story 3.2)。
      { path: 'connections/google/calendars', element: <GoogleCalendarPicker /> },
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
