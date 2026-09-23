import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { onDeepLink } from '@/platform/deepLink';
import { isValidLocalDate } from '@/lib/datetime';

/**
 * ディープリンクの唯一の受け口(ARCHITECTURE-SPINE Epic5 AD-16)。
 * `calendar-app://event/{id}`、`calendar-app://day/{date}`、
 * `calendar-app://create/{date}` の形式だけを解釈し、既存のルーティングへ委ねる。
 * 未知のスキーム/ホスト部は静かに無視する(現在の画面のまま何もしない、クラッシュしない)。
 *
 * `<BrowserRouter>` の内側、`<AppRoutes />` と並べて配置する(src/main.tsx)。
 * 5.4(通知タップ)・5.5/5.6(ウィジェットタップ)も同じこの1ファイルを再利用する想定(Design Notes)。
 */
export function DeepLinkListener() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = onDeepLink((url) => {
      if (disposed) return;
      const to = toInternalRoute(url);
      if (!to) return;
      navigateRef.current(to);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  // BrowserRouter の navigate は遷移ごとに変わる。再購読すると起動URLが再送され、
  // カレンダーへの遷移を繰り返すため、購読はマウントにつき一度に固定する。
  }, []);

  return null;
}

/**
 * `calendar-app://event/{id}` → `/calendar?event={id}`
 * `calendar-app://day/{date}` → `/calendar?date={date}`
 * `calendar-app://create/{date}` → `/calendar?create={date}`
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
  if (kind === 'day' && isValidLocalDate(value)) return `/calendar?date=${encodeURIComponent(value)}`;
  if (kind === 'create' && isValidLocalDate(value)) {
    return `/calendar?create=${encodeURIComponent(value)}`;
  }
  return null;
}

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
