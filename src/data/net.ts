/**
 * ネットワーク到達性の判定。data-access レイヤがオフライン分岐に使う。
 */

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * supabase-js / fetch がネットワーク到達不能で失敗したかを判定する。
 * PostgREST の業務エラー(RLS・制約違反など)は false。
 */
export function isNetworkError(error: unknown): boolean {
  if (isOffline()) return true;
  if (error instanceof TypeError) return true; // fetch 失敗は TypeError
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : '';
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('fetch failed')
  );
}
