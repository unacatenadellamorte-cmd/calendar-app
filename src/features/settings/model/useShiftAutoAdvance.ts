import { useSyncExternalStore } from 'react';

/** シフト登録成功後に選択日を翌日へ進める設定。既定値は現状維持(false)。 */
export const SHIFT_AUTO_ADVANCE_STORAGE_KEY = 'calendar-app.shift-auto-advance';

export function readStoredShiftAutoAdvance(): boolean {
  try {
    return window.localStorage.getItem(SHIFT_AUTO_ADVANCE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let current: boolean | undefined;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
const getSnapshot = () => current ?? (current = readStoredShiftAutoAdvance());

// 画面間の移動中も別タブからの変更を受け取る、アプリ全体で一つのストア。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SHIFT_AUTO_ADVANCE_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    current = event.key !== null && event.newValue === 'true';
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setShiftAutoAdvance(next: boolean): void {
  current = next;
  try {
    window.localStorage.setItem(SHIFT_AUTO_ADVANCE_STORAGE_KEY, String(next));
  } catch {
    // 保存できなくても共有メモリを保ち、画面移動後にも設定を反映する。
  }
  notify();
}

/** テスト用: 次の購読時にストレージから初期化し直す。 */
export function resetShiftAutoAdvanceForTests(): void {
  current = undefined;
  notify();
}

export function useShiftAutoAdvance(): {
  shiftAutoAdvance: boolean;
  setShiftAutoAdvance: (next: boolean) => void;
} {
  const shiftAutoAdvance = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return { shiftAutoAdvance, setShiftAutoAdvance };
}
