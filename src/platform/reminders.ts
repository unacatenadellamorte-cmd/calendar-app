import { isAccountDataBlocked } from '@/data/account-deletion-state';
import type { PermissionState } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * ネイティブブリッジ層(ARCHITECTURE-SPINE Epic5、`deviceCalendar.ts`/`deepLink.ts` と同じ層分離)。
 * `@capacitor/local-notifications` の薄いラッパ。ロジックは持たない、受け渡し専用。
 * 通知IDの導出は呼び出し側(`src/data/reminders.ts` 等)が `packages/core` の
 * `deriveNotificationId` だけを使って行う ── このファイルでは作らない。
 *
 * Web(ブラウザ/vitest)では `Notification` API が使えないと `schedule()`/
 * `requestPermissions()` が例外を投げ得る(プラグインの web シム)。呼び出し側
 * (`src/data/reminders.ts`)が失敗を吸収する。
 */

/** OS の通知許可ダイアログを出す(既に確定していれば確認のみ)。 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const { display } = await LocalNotifications.requestPermissions();
  return display;
}

/** Web版では Local Notifications が使えないため、保存と通知表示を分離する。 */
export function isNotificationSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export interface ScheduleReminderOptions {
  id: number;
  eventId: string;
  title: string;
  /** 通知を出す時刻。 */
  at: Date;
}

/** `at` の壁時計(HH:MM)。通知本文用の最小の整形(タイムゾーン変換は呼び出し側の Date 自体に既に反映済み)。 */
function clockLabel(at: Date): string {
  return `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** 通知を1件スケジュールする。`extra.eventId` を積み、通知タップ時に `deepLink.ts` が拾う。 */
const pendingSchedules = new Set<Promise<unknown>>();

export async function scheduleReminder(opts: ScheduleReminderOptions): Promise<void> {
  if (isAccountDataBlocked()) return;
  const task = LocalNotifications.schedule({
    notifications: [
      {
        id: opts.id,
        title: opts.title,
        body: clockLabel(opts.at),
        schedule: { at: opts.at, allowWhileIdle: true },
        extra: { eventId: opts.eventId },
      },
    ],
  });
  pendingSchedules.add(task);
  try { await task; } finally { pendingSchedules.delete(task); }
}

/** 通知を1件取り消す(スケジュールされていなくても無害)。 */
export async function cancelReminder(id: number): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

/** 予約中と表示済みの両方を消す。失敗時は削除を未完了のまま再試行する。 */
export async function clearAccountNotifications(): Promise<void> {
  if (!isNotificationSupported()) return;
  await Promise.allSettled([...pendingSchedules]);
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length) await LocalNotifications.cancel({ notifications });
  await LocalNotifications.removeAllDeliveredNotifications();
}
