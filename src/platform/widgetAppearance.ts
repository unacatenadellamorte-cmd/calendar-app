import { readStoredMonthEventSize, type MonthEventSize } from '@/features/settings/model/monthEventSize';
import { readStoredTheme, type ThemePreference } from '@/features/settings/model/useTheme';
import { themePalettes } from '@/features/settings/model/themePalettes';
import { DEFAULT_GLASS_REFRACTION, DEFAULT_WIDGET_GLASS_TRANSPARENCY, normalizeGlassTransparency, readStoredGlassRefraction, readStoredWidgetGlassTransparency } from '@/features/settings/model/glassAppearance';
export { WIDGET_APPEARANCE_CHANGED } from './widgetAppearanceEvents';

export const WIDGET_APPEARANCE_KEY = 'widgetAppearance';

export interface WidgetAppearance {
  schemaVersion: 1;
  theme: ThemePreference;
  backgroundColor: string;
  surfaceColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  mutedTextColor: string;
  accentColor: string;
  todayColor: string;
  todayTextColor: string;
  appFontScale: number;
  /** ガラステーマのウィジェット面の透過度(0〜100)。0=不透明、100=面が透明。schemaVersion 1 への追加項目で、古い読み手は無視する。 */
  widgetTransparency: number;
  /** ガラスの屈折の強さ(0〜100、見た目の調整値でIORではない)。ウィジェットでは縁の厚み・反射・分散の強さに使う。schemaVersion 1 への追加項目で、欠けた旧形式は読み手が既定50とする。 */
  widgetRefraction: number;
}

const FONT_SCALE: Record<MonthEventSize, number> = { small: 0.8, medium: 1, large: 1.2 };
const FALLBACK = { backgroundColor: '#FFFFFF', surfaceColor: '#FFFFFF', primaryTextColor: '#1A1C1E', secondaryTextColor: '#585F68', mutedTextColor: '#A0A6AD', accentColor: '#2563EB', todayColor: '#EAF1FF' };

function cssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim() || fallback;
}

function isDarkTheme(theme: ThemePreference): boolean {
  return theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
}

export function buildWidgetAppearance(theme: ThemePreference = readStoredTheme(), monthEventSize: MonthEventSize = readStoredMonthEventSize(), widgetTransparency: number = readStoredWidgetGlassTransparency(), widgetRefraction: number = readStoredGlassRefraction()): WidgetAppearance {
  const palette = theme in themePalettes ? themePalettes[theme as keyof typeof themePalettes].colors : null;
  const dark = isDarkTheme(theme);
  const backgroundColor = palette?.[0] ?? cssColor('surface-base', dark ? '#0f1b31' : FALLBACK.backgroundColor);
  const surfaceColor = palette?.[2] ?? cssColor('surface-raised', dark ? '#152643' : FALLBACK.surfaceColor);
  const primaryTextColor = palette?.[3] ?? cssColor('ink-primary', dark ? '#e9f0fa' : FALLBACK.primaryTextColor);
  const secondaryTextColor = palette?.[4] ?? cssColor('ink-secondary', dark ? '#a3b4cc' : FALLBACK.secondaryTextColor);
  const mutedTextColor = palette?.[5] ?? cssColor('ink-disabled', dark ? '#6a7c96' : FALLBACK.mutedTextColor);
  const accentColor = palette?.[6] ?? cssColor('accent', dark ? '#5cc4e6' : FALLBACK.accentColor);
  return { schemaVersion: 1, theme, backgroundColor, surfaceColor, primaryTextColor, secondaryTextColor, mutedTextColor, accentColor, todayColor: palette?.[7] ?? cssColor('accent-weak', dark ? '#123350' : FALLBACK.todayColor), todayTextColor: accentColor, appFontScale: FONT_SCALE[monthEventSize], widgetTransparency: normalizeGlassTransparency(widgetTransparency, DEFAULT_WIDGET_GLASS_TRANSPARENCY), widgetRefraction: normalizeGlassTransparency(widgetRefraction, DEFAULT_GLASS_REFRACTION) };
}
