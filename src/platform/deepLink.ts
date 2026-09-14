import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { LocalNotifications, type ActionPerformed } from '@capacitor/local-notifications';

/**
 * ネイティブブリッジ層(ARCHITECTURE-SPINE Epic5 AD-12 と同じ層分離)。
 * `@capacitor/app` の `appUrlOpen` イベントと、`@capacitor/local-notifications` の
 * `localNotificationActionPerformed`(通知タップ、Story 5.4)を、どちらも同じ
 * `handler` へ右から左に流すだけの薄いラッパ。URL のパース・ナビゲーション判断は
 * 一切持たない — それは受け口である `src/app/DeepLinkListener.tsx` の責務
 * (AD-16: 受け口は `src/app` に1箇所だけ)。通知タップは `notification.extra.eventId`
 * から `calendar-app://event/{eventId}` を合成して渡すことで、`DeepLinkListener.tsx`
 * 自体は無変更のまま appUrlOpen と通知タップの両方に対応できる。
 *
 * Web(ブラウザ/vitest)ではどちらのプラグインも動作しないプラットフォームだが、
 * Capacitor のプラグインは未対応プラットフォームでも import 自体は安全に行える
 * (呼び出し時に該当プラットフォームがなければ何もしない)。
 */
export function onDeepLink(handler: (url: string) => void): () => void {
  const listenerHandle = App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    handler(event.url);
  });
  const notificationListenerHandle = LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action: ActionPerformed) => {
      const eventId = (action.notification.extra as { eventId?: unknown } | undefined)?.eventId;
      if (typeof eventId === 'string' && eventId) {
        handler(`calendar-app://event/${eventId}`);
      }
    },
  );
  return () => {
    void listenerHandle.then((listener) => listener.remove());
    void notificationListenerHandle.then((listener) => listener.remove());
  };
}
