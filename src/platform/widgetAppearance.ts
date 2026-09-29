import { readStoredMonthEventSize, type MonthEventSize } from '@/features/settings/model/monthEventSize';
import { readStoredTheme, type ThemePreference } from '@/features/settings/model/useTheme';
import { themePalettes } from '@/features/settings/model/themePalettes';
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

export function buildWidgetAppearance(theme: ThemePreference = readStoredTheme(), monthEventSize: MonthEventSize = readStoredMonthEventSize()): WidgetAppearance {
  const palette = theme in themePalettes ? themePalettes[theme as keyof typeof themePalettes].colors : null;
  const dark = isDarkTheme(theme);
  const backgroundColor = palette?.[0] ?? cssColor('surface-base', dark ? '#16181C' : FALLBACK.backgroundColor);
  const surfaceColor = palette?.[2] ?? cssColor('surface-raised', dark ? '#1E2126' : FALLBACK.surfaceColor);
  const primaryTextColor = palette?.[3] ?? cssColor('ink-primary', dark ? '#E6E8EB' : FALLBACK.primaryTextColor);
  const secondaryTextColor = palette?.[4] ?? cssColor('ink-secondary', dark ? '#9AA1A9' : FALLBACK.secondaryTextColor);
  const mutedTextColor = palette?.[5] ?? cssColor('ink-disabled', dark ? '#5B616A' : FALLBACK.mutedTextColor);
  const accentColor = palette?.[6] ?? cssColor('accent', dark ? '#6AA0FF' : FALLBACK.accentColor);
  return { schemaVersion: 1, theme, backgroundColor, surfaceColor, primaryTextColor, secondaryTextColor, mutedTextColor, accentColor, todayColor: palette?.[7] ?? cssColor('accent-weak', dark ? '#1C2740' : FALLBACK.todayColor), todayTextColor: accentColor, appFontScale: FONT_SCALE[monthEventSize] };
}
