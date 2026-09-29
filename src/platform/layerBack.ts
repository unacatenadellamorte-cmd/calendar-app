import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const layers: (() => void)[] = [];
const marker = '__calendarLayer';
let guard: { id: number; url: string } | null = null;
let serial = 0;
let listening = false;
let removing = false;
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

/** Webでは同じURLの履歴を1段だけ追加し、戻るを最前面のレイヤーに渡す。 */
function ensureWebGuard() {
  if (!layers.length || removing) return;
  if (!listening) {
    window.addEventListener('popstate', onWebPop);
    listening = true;
  }
  if (guard && history.state?.[marker] === guard.id) return;
  guard = { id: ++serial, url: location.href };
  history.pushState({ ...history.state, [marker]: guard.id }, '', location.href);
}
function settleWebGuard() {
  if (cleanupTimer !== null) clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    // ブラウザ破棄後（テスト環境の終了を含む）には履歴を操作しない。
    if (typeof window === 'undefined') return;
    if (layers.length) {
      ensureWebGuard();
      return;
    }
    if (guard && history.state?.[marker] === guard.id && location.href === guard.url) {
      guard = null;
      removing = true;
      history.back();
      return;
    }
    guard = null;
    if (!removing) {
      window.removeEventListener('popstate', onWebPop);
      listening = false;
    }
  }, 0);
}
function onWebPop(event: PopStateEvent) {
  if (removing) {
    removing = false;
    settleWebGuard();
    return;
  }
  if (!guard || event.state?.[marker] === guard.id) return;
  const samePage = location.href === guard.url;
  guard = null;
  if (samePage) layers.at(-1)?.();
  settleWebGuard();
}

/** 最前面だけを閉じる。WebとAndroidの履歴方式は混在させない。 */
export function registerLayerBack(close: () => void): () => void {
  layers.push(close);
  let active = true;
  const native = Capacitor.getPlatform() === 'android';
  const handle = native
    ? App.addListener('backButton', () => {
        if (active && layers.at(-1) === close) close();
      })
    : null;
  if (!native) ensureWebGuard();
  return () => {
    if (!active) return;
    active = false;
    const index = layers.indexOf(close);
    if (index >= 0) layers.splice(index, 1);
    void handle?.then((listener) => listener.remove());
    if (!native) settleWebGuard();
  };
}
