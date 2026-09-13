import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onDeepLink } from '@/platform/deepLink';

/**
 * ディープリンクの唯一の受け口(ARCHITECTURE-SPINE Epic5 AD-16)。
 * `calendar-app://event/{id}` と `calendar-app://day/{date}` の2形式だけを解釈し、
 * 既存のルーティング(`/calendar?event=` / `/calendar?date=`)へ委ねる。
 * 未知のスキーム/ホスト部は静かに無視する(現在の画面のまま何もしない、クラッシュしない)。
 *
 * `<BrowserRouter>` の内側、`<AppRoutes />` と並べて配置する(src/main.tsx)。
 * 5.4(通知タップ)・5.5/5.6(ウィジェットタップ)も同じこの1ファイルを再利用する想定(Design Notes)。
 */
export function DeepLinkListener() {
  const navigate = useNavigate();

  useEffect(() => {
    return onDeepLink((url) => {
      const to = toInternalRoute(url);
      if (!to) return;
      navigate(to);
      if (to.startsWith('/calendar?event=')) {
        // ?event= は一度きりの指定。開いた後も URL に残ると、PWA を手動リロードしたときに
        // 同じ予定シートが再度開いてしまうため、遷移後にクエリを取り除く(replace で
        // 履歴に残さない)。React 18 のバッチングで直後に同期実行すると、CalendarScreen が
        // ?event= 付きの状態を一度も描画できず開かなくなるため、次の macrotask まで遅らせる。
        setTimeout(() => navigate('/calendar', { replace: true }), 0);
      }
    });
  }, [navigate]);

  return null;
}

/**
 * `calendar-app://event/{id}` → `/calendar?event={id}`
 * `calendar-app://day/{date}` → `/calendar?date={date}`
 * それ以外(未知のスキーム/ホスト、パース不能、空値)は null。
 */
function toInternalRoute(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // カスタムスキーム `calendar-app://event/xxx` は WHATWG URL 上、
  // hostname に 'event'、pathname に '/xxx' として入る。
  if (parsed.protocol !== 'calendar-app:') return null;

  const kind = parsed.hostname.toLowerCase();
  const value = decodeSegment(parsed.pathname.replace(/^\/+/, ''));
  if (!value) return null;

  if (kind === 'event') return `/calendar?event=${encodeURIComponent(value)}`;
  if (kind === 'day') return `/calendar?date=${encodeURIComponent(value)}`;
  return null;
}

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
