import { useSyncExternalStore } from 'react';

/**
 * ホームのコンパクトビューに出す代表予定の件数(1〜3、既定3)。
 * 設定画面とホームは別ルートだが、変更が即座に両方へ届くようモジュールストアにする
 * (`useTheme` 型の useState + localStorage だと再マウントまで反映されない)。
 */

const STORAGE_KEY = 'calendar-app.featured-count';

export const FEATURED_COUNT_MIN = 1;
export const FEATURED_COUNT_MAX = 3;
export const FEATURED_COUNT_DEFAULT = 3;

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return FEATURED_COUNT_DEFAULT;
  return Math.min(FEATURED_COUNT_MAX, Math.max(FEATURED_COUNT_MIN, Math.round(n)));
}

function readStored(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return FEATURED_COUNT_DEFAULT;
    const n = Number(raw);
    return Number.isInteger(n) && n >= FEATURED_COUNT_MIN && n <= FEATURED_COUNT_MAX
      ? n
      : FEATURED_COUNT_DEFAULT;
  } catch {
    // localStorage 不可(プライベートモード等)。既定に落とす。
    return FEATURED_COUNT_DEFAULT;
  }
}

let current = readStored();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): number {
  return current;
}

/** 件数を設定する。範囲外は clamp。保存できなくても状態は反映する。 */
export function setFeaturedCount(next: number): void {
  const value = clampCount(next);
  if (value === current) return;
  current = value;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // 保存できなくても表示は更新する。
  }
  for (const listener of listeners) listener();
}

/** テスト用: localStorage を読み直して内部状態をリセットする。 */
export function resetFeaturedCountForTests(): void {
  current = readStored();
  for (const listener of listeners) listener();
}

/** 現在の件数を購読する。 */
export function useFeaturedCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
