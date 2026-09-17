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
  let active = true;
  // 冷起動時に同じ URL が appUrlOpen と getLaunchUrl の両方から届く実装差を吸収する。
  // getLaunchUrl が解決するまでに届いた warm URL だけを一時的に記録し、通常の同日再タップは
  // getLaunchUrl の解決後ならそのまま通す。
  let launchResolved = false;
  let warmUrlReceivedBeforeLaunch = false;
  const deliverWarmUrl = (url: string) => {
    if (!active) return;
    if (!launchResolved) warmUrlReceivedBeforeLaunch = true;
    handler(url);
  };

  let listenerHandle: Promise<{ remove: () => void }> | undefined;
  try {
    listenerHandle = App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      deliverWarmUrl(event.url);
    });
    void listenerHandle.catch(() => undefined);
  } catch {
    // Web や未実装の Capacitor ランタイムでは購読できないことがある。
  }

  let notificationListenerHandle: Promise<{ remove: () => void }> | undefined;
  try {
    notificationListenerHandle = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action: ActionPerformed) => {
        if (!active) return;
        const eventId = (action.notification.extra as { eventId?: unknown } | undefined)?.eventId;
        if (typeof eventId === 'string' && eventId) {
          handler(`calendar-app://event/${eventId}`);
        }
      },
    );
    void notificationListenerHandle.catch(() => undefined);
  } catch {
    // Web では通知プラグインが未実装でも、カレンダー画面自体は使えるようにする。
  }

  // getLaunchUrl がない Web 実装もある。呼び出しは常に購読登録後に行い、競合時の URL を拾う。
  void (async () => {
    try {
      if (typeof App.getLaunchUrl !== 'function') return;
      const launch = await App.getLaunchUrl();
      // warm が一件でも先に届いた場合は、遅れて返る launch URL を採用しない。
      // 起動時に別 URL が返る実装では、古い launch URL が warm 遷移を上書きし得るため。
      if (!active || !launch?.url || warmUrlReceivedBeforeLaunch) return;
      handler(launch.url);
    } catch {
      // Web / 起動 URL 非対応環境では静かに無視する。
    } finally {
      launchResolved = true;
    }
  })();

  return () => {
    active = false;
    const remove = (handle: Promise<{ remove: () => void }> | undefined) => {
      if (!handle) return;
      void handle.then((listener) => listener.remove()).catch(() => undefined);
    };
    remove(listenerHandle);
    remove(notificationListenerHandle);
  };
}
