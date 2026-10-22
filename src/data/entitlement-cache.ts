import { isEntitlementActive, type Entitlement } from './entitlements';

const PREFIX = 'calendar-app.entitlements.v1.';

/** サーバーで確認した期限付き権利だけを利用者別に保存する。 */
export function cacheEntitlements(userId: string, rows: readonly Entitlement[]): void {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(rows.filter((row) => row.expiresAt !== null && isEntitlementActive(row))));
  } catch { /* 保存不可の端末ではオフライン権利を使わない。 */ }
}

export function readCachedEntitlements(userId: string): Entitlement[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(PREFIX + userId) ?? '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is Entitlement =>
      row !== null && typeof row === 'object' &&
      ['calendar_write', 'multi_account', 'device_photos'].includes(row.entitlement) &&
      typeof row.expiresAt === 'string' && isEntitlementActive(row),
    );
  } catch { return []; }
}

/** 利用者切替・削除時に確認済み権利も解放する。 */
export function clearEntitlementCache(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
