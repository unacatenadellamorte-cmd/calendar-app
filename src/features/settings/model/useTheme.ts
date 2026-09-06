import { useCallback, useEffect, useState } from 'react';

/** テーマの選択肢。'system' は端末設定に追従する。 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'calendar-app.theme';
const VALID: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

/** localStorage から選択を読む。private モードや例外時は 'system' にフォールバック。 */
export function readStoredTheme(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

/** ルート要素の data-theme 属性を更新する。'system' 時は属性を外して端末追従に戻す。 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

/**
 * 起動時に一度だけ呼ぶ。保存済みの選択を DOM に反映する。
 * React のレンダリング前に効かせたい場合は main.tsx から直接呼ぶ。
 */
export function initTheme(): void {
  applyTheme(readStoredTheme());
}

/** 設定画面用フック。現在の選択と、選択を変える関数を返す。 */
export function useTheme(): {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
} {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても当セッションの見た目は変わる(applyTheme が effect で走る)
    }
  }, []);

  return { theme, setTheme };
}
