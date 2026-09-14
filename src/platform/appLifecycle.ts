import { App } from '@capacitor/app';

/**
 * ネイティブブリッジ層(ARCHITECTURE-SPINE Epic5 AD-12 と同じ層分離、`deepLink.ts` と対の形)。
 * `@capacitor/app` の `resume` イベント(フォアグラウンド復帰)を右から左に流すだけの
 * 薄いラッパ。何を取り込むかの判断は一切持たない ── それは呼び出し側
 * (`src/app/DeviceSyncOnResume.tsx`)の責務。
 *
 * Web(ブラウザ/vitest)では `@capacitor/app` は動作しないプラットフォームだが、
 * Capacitor のプラグインは未対応プラットフォームでも import 自体は安全に行える
 * (呼び出し時に該当プラットフォームがなければ何もしない)。
 */
export function onAppResume(handler: () => void): () => void {
  const listenerHandle = App.addListener('resume', () => {
    handler();
  });
  return () => {
    void listenerHandle.then((listener) => listener.remove());
  };
}
