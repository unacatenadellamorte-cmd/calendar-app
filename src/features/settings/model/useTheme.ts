import { useCallback, useEffect, useState } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { paletteTokens, themePalettes, type PaletteName } from './themePalettes';
import { notifyWidgetAppearanceChanged } from '@/platform/widgetAppearanceEvents';
import {
  applyAppGlassTransparency,
  applyGlassRefraction,
  applyMetalGloss,
  readStoredAppGlassTransparency,
  readStoredGlassRefraction,
  readStoredMetalGloss,
} from './glassAppearance';
import { syncGlassRefraction } from './glassRefraction';

/** テーマの選択肢。'system' は端末設定に追従する。 */
export type ThemePreference = 'system' | 'light' | 'dark' | PaletteName;

const STORAGE_KEY = 'calendar-app.theme';
const VALID: readonly ThemePreference[] = ['system', 'light', 'dark', 'sakura', 'leaf', 'ocean', 'lavender', 'glass', 'gold', 'silver'];

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
  paletteTokens.forEach((token) => root.style.removeProperty(`--color-${token}`));
  if (preference in themePalettes) {
    const palette = themePalettes[preference as PaletteName];
    paletteTokens.forEach((token, index) => root.style.setProperty(`--color-${token}`, palette.colors[index]!));
  }
  // ヘッダーやステータスバーは、選択中テーマの文字色を基準にした濃色面へ揃える。
  // system は tokens.css の prefers-color-scheme 定義に任せる。
  if (preference === 'system') {
    root.style.removeProperty('--color-chrome-surface');
  } else if (preference === 'dark') {
    root.style.setProperty('--color-chrome-surface', '#090b0f');
  } else if (preference === 'glass') {
    // ガラスは上部・下部の面も明るい曇りガラスにし、濃い文字で可読性を保つ。
    root.style.setProperty('--color-chrome-surface', '#e4f0f8');
  } else if (preference === 'gold') {
    // ゴールドは黒っぽいブロンズの帯に、温かい白の文字を載せる(磨いた金の陰側)。
    root.style.setProperty('--color-chrome-surface', '#3a2911');
  } else if (preference === 'silver') {
    // シルバーは明るい鏡面の帯にチャコールの文字を載せる。
    root.style.setProperty('--color-chrome-surface', '#d3d7dd');
  } else {
    root.style.setProperty('--color-chrome-surface', 'color-mix(in srgb, var(--color-ink-primary) 90%, #000)');
  }
  root.style.setProperty(
    '--color-chrome-ink',
    preference === 'glass' ? '#14283a' : preference === 'silver' ? '#16191e' : preference === 'gold' ? '#fff4dc' : '#ffffff',
  );
  // v8 の SystemBars.Dark は「暗い面に明るいアイコン」を意味する。
  // Web 実行時は未実装なので失敗を握りつぶし、CSS 面だけで継続する。
  // chrome面は system 選択時も常に濃色なので、OS設定に任せず白アイコンを指定する。
  // ガラスとシルバーは明るい面なので、濃いアイコン(LIGHT)を指定する。
  const systemBarStyle = preference === 'glass' || preference === 'silver' ? SystemBarsStyle.Light : SystemBarsStyle.Dark;
  if (Capacitor.isNativePlatform() && SystemBars && typeof SystemBars.setStyle === 'function') {
    void Promise.resolve(SystemBars.setStyle({ style: systemBarStyle })).catch(() => undefined);
  }
  root.style.colorScheme = preference === 'system' ? 'light dark' : preference === 'dark' ? 'dark' : 'light';
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
  // ガラスの面(透過度・屈折・縁)は全テーマ共通。テーマ色は theme-glass.css が面の着色として使う。
  root.setAttribute('data-glass', 'on');
  syncGlassRefraction();
  notifyWidgetAppearanceChanged();
}

/**
 * 起動時に一度だけ呼ぶ。保存済みの選択を DOM に反映する。
 * React のレンダリング前に効かせたい場合は main.tsx から直接呼ぶ。
 */
export function initTheme(): void {
  // ガラスの透過度も起動時に復元する(テーマ切替前でもCSS変数を持たせ、再起動後も保持する)。
  applyAppGlassTransparency(readStoredAppGlassTransparency());
  applyGlassRefraction(readStoredGlassRefraction());
  applyMetalGloss(readStoredMetalGloss());
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
