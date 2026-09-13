import { App, type URLOpenListenerEvent } from '@capacitor/app';

/**
 * ネイティブブリッジ層(ARCHITECTURE-SPINE Epic5 AD-12 と同じ層分離)。
 * `@capacitor/app` の `appUrlOpen` イベントを右から左に流すだけの薄いラッパ。
 * URL のパース・ナビゲーション判断は一切持たない — それは受け口である
 * `src/app/DeepLinkListener.tsx` の責務(AD-16: 受け口は `src/app` に1箇所だけ)。
 *
 * Web(ブラウザ/vitest)では `@capacitor/app` は動作しないプラットフォームだが、
 * Capacitor のプラグインは未対応プラットフォームでも import 自体は安全に行える
 * (呼び出し時に該当プラットフォームがなければ何もしない)。
 */
export function onDeepLink(handler: (url: string) => void): () => void {
  const listenerHandle = App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    handler(event.url);
  });
  return () => {
    void listenerHandle.then((listener) => listener.remove());
  };
}
