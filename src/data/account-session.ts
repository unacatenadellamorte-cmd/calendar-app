import { beginAccountTransition } from './account-scope';
import { clearEntitlementCache } from './entitlement-cache';

/** 再ログイン前の後始末。失敗時は切替を止め、旧データを再表示しない。 */
export async function clearPreviousAccountSession(): Promise<void> {
  beginAccountTransition();
  try {
    clearEntitlementCache();
  } finally {
    const [{ clearLocalCachedData }, { clearAccountNotifications }, { clearAccountWidgets }] =
      await Promise.all([
        import('./local-db'),
        import('@/platform/reminders'),
        import('@/platform/widget'),
      ]);
    await clearLocalCachedData();
    await clearAccountNotifications();
    await clearAccountWidgets();
    const { storeBackground, applyBackground } =
      await import('@/features/settings/model/backgroundImage');
    await storeBackground(null);
    applyBackground(null);
  }
}
