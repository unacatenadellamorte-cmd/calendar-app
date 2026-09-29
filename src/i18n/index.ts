import { useSyncExternalStore } from 'react';
import { catalog } from './catalog';

export const languages = [
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'zh', name: '简体中文', locale: 'zh-CN' },
  { code: 'ko', name: '한국어', locale: 'ko-KR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
] as const;
export type Language = (typeof languages)[number]['code'];
const STORAGE_KEY = 'calendar-app.language';
let language: Language = 'ja';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getLanguage = () => language;
export const getLocale = (preference: Language = language) =>
  languages.find((item) => item.code === preference)!.locale;
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, getLanguage);

export function isLanguage(value: unknown): value is Language {
  return languages.some((item) => item.code === value);
}

export function detectLanguage(values: readonly string[]): Language {
  for (const value of values) {
    const prefix = value.toLowerCase().split('-')[0];
    if (isLanguage(prefix)) return prefix;
  }
  return 'en';
}

export function applyLanguage(next: Language): void {
  language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-Hans' : next;
  listeners.forEach((listener) => listener());
}

/** 永続化できない場合は変更せず、呼び出し元がエラーを表示する。 */
export function setLanguage(next: Language): boolean {
  if (!isLanguage(next)) return false;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return false;
  }
  applyLanguage(next);
  return true;
}

export function initLanguage(): void {
  let stored: unknown;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* 端末候補で起動する。 */
  }
  applyLanguage(
    isLanguage(stored) ? stored : detectLanguage(navigator.languages ?? [navigator.language]),
  );
}

/** 固定文言だけを明示的に翻訳し、差し込み値は翻訳しない。 */
export function t(
  source: string,
  values: readonly (string | number | boolean | null | undefined)[] = [],
): string {
  const index = languages.findIndex((item) => item.code === language) - 1;
  const translated =
    index < 0 ? source : (catalog[source]?.[index] ?? catalog[source]?.[0] ?? source);
  return translated.replace(/\{(\d+)\}/g, (match, n: string) =>
    values[Number(n)] === undefined
      ? match
      : String(values[Number(n)] === false ? '' : (values[Number(n)] ?? '')),
  );
}

/** 日曜始まりの曜日見出し。暦日とタイムゾーンの計算は変更しない。 */
export function weekdayLabels(): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(
      new Date(2026, 0, 4 + i),
    ),
  );
}
