import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyWidgetAppearanceChanged } from '@/platform/widgetAppearanceEvents';
import { syncGlassRefraction } from './glassRefraction';

/**
 * 全テーマ共通のガラス透過度(0〜100%)。
 * - 0% は面が不透明、100% は最も透明な設定。文字の可読性を守る最小保護面は残す。
 * - 文字・入力欄・予定ラベル・反射縁は読みやすさのため透過度に連動させない。
 * - 不正値・欠損・範囲外は既定値へ戻す(範囲外の数値は端に丸める)。
 */
export const GLASS_TRANSPARENCY_MIN = 0;
export const GLASS_TRANSPARENCY_MAX = 100;
/** 既定値。従来(面の不透明度 約0.42〜0.94)より透明寄り。文字コントラストは検証済み。 */
export const DEFAULT_APP_GLASS_TRANSPARENCY = 70;
/** ウィジェットは壁紙が不明なため、黒い壁紙でも本文4.5:1以上を保つ値にする(約35%)。 */
export const DEFAULT_WIDGET_GLASS_TRANSPARENCY = 35;

/**
 * 屈折の強さ(0〜100)。0で背景の歪みなし、100で縁の屈折が最大。
 * 見た目の調整値であり、実測の屈折率(IOR)ではない。アプリとウィジェットで共通。
 */
export const DEFAULT_GLASS_REFRACTION = 50;

const APP_KEY = 'calendar-app.glass-app-transparency';
const REFRACTION_KEY = 'calendar-app.glass-refraction';
const WIDGET_KEY = 'calendar-app.glass-widget-transparency';
/** ウィジェット更新は予定の再取得も伴うため、操作が止まってから送る。 */
const WIDGET_NOTIFY_DELAY_MS = 350;

/** 任意の値を0〜100の整数へ正規化する。数値として読めない値は既定値。 */
export function normalizeGlassTransparency(value: unknown, fallback: number): number {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(GLASS_TRANSPARENCY_MAX, Math.max(GLASS_TRANSPARENCY_MIN, number)));
}

function readStored(key: string, fallback: number): number {
  try {
    return normalizeGlassTransparency(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // 保存できなくても、このセッションの見た目は変わる。
  }
}

export function readStoredAppGlassTransparency(): number {
  return readStored(APP_KEY, DEFAULT_APP_GLASS_TRANSPARENCY);
}

export function readStoredWidgetGlassTransparency(): number {
  return readStored(WIDGET_KEY, DEFAULT_WIDGET_GLASS_TRANSPARENCY);
}

export function readStoredGlassRefraction(): number {
  return readStored(REFRACTION_KEY, DEFAULT_GLASS_REFRACTION);
}

/**
 * 屈折の強さを反映する。CSSは --glass-refraction(0〜1)で縁の厚み・反射を変え、
 * 背景の実変位は対応する描画系だけ glassRefraction.ts が行う。
 */
export function applyGlassRefraction(value: number): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeGlassTransparency(value, DEFAULT_GLASS_REFRACTION);
  document.documentElement.style.setProperty('--glass-refraction', String(normalized / 100));
  syncGlassRefraction(normalized);
}

/** アプリ側のガラス面へ反映する。CSSは theme-glass.css の --glass-clear(0〜1)を使う。 */
export function applyAppGlassTransparency(value: number): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeGlassTransparency(value, DEFAULT_APP_GLASS_TRANSPARENCY);
  document.documentElement.style.setProperty('--glass-clear', String(normalized / 100));
}

/** 設定画面用フック。操作中は即時にCSSへ反映し、保存とウィジェット通知も行う。 */
export function useGlassTransparency(): {
  appTransparency: number;
  widgetTransparency: number;
  setAppTransparency: (next: number) => void;
  setWidgetTransparency: (next: number) => void;
  refraction: number;
  setRefraction: (next: number) => void;
} {
  const [appTransparency, setAppState] = useState(() => readStoredAppGlassTransparency());
  const [widgetTransparency, setWidgetState] = useState(() => readStoredWidgetGlassTransparency());
  const [refraction, setRefractionState] = useState(() => readStoredGlassRefraction());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => applyAppGlassTransparency(appTransparency), [appTransparency]);
  useEffect(() => applyGlassRefraction(refraction), [refraction]);
  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        // 画面を離れる直前の変更も、ウィジェットへ確実に送る。
        notifyWidgetAppearanceChanged();
      }
    },
    [],
  );

  const setAppTransparency = useCallback((next: number) => {
    const value = normalizeGlassTransparency(next, DEFAULT_APP_GLASS_TRANSPARENCY);
    setAppState(value);
    writeStored(APP_KEY, value);
  }, []);

  const notifyWidgetLater = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      notifyWidgetAppearanceChanged();
    }, WIDGET_NOTIFY_DELAY_MS);
  }, []);

  const setWidgetTransparency = useCallback(
    (next: number) => {
      const value = normalizeGlassTransparency(next, DEFAULT_WIDGET_GLASS_TRANSPARENCY);
      setWidgetState(value);
      writeStored(WIDGET_KEY, value);
      notifyWidgetLater();
    },
    [notifyWidgetLater],
  );

  /** 屈折の強さはウィジェットの縁の厚み・反射にも使うため、同じく遅延して通知する。 */
  const setRefraction = useCallback(
    (next: number) => {
      const value = normalizeGlassTransparency(next, DEFAULT_GLASS_REFRACTION);
      setRefractionState(value);
      writeStored(REFRACTION_KEY, value);
      notifyWidgetLater();
    },
    [notifyWidgetLater],
  );

  return { appTransparency, widgetTransparency, setAppTransparency, setWidgetTransparency, refraction, setRefraction };
}
