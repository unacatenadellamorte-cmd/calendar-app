import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLanguage,
  detectLanguage,
  getLanguage,
  initLanguage,
  languages,
  setLanguage,
  t,
  weekdayLabels,
} from './index';
import { catalog } from './catalog';
import sourceKeys from './source-keys.json';
import { formatDayTitle, formatMonthTitle } from '@/lib/datetime';

afterEach(() => {
  vi.restoreAllMocks();
  applyLanguage('ja');
});

describe('表示言語', () => {
  it('端末の優先順から対応言語を選び、非対応なら英語にする', () => {
    expect(detectLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'ko-KR'])).toBe('ko');
    expect(detectLanguage(['zh-TW'])).toBe('zh');
    expect(detectLanguage(['de'])).toBe('en');
  });
  it.each(languages)('$name の設定を保存し、起動時に復元する', ({ code }) => {
    expect(setLanguage(code)).toBe(true);
    applyLanguage('ja');
    initLanguage();
    expect(getLanguage()).toBe(code);
    expect(document.documentElement.lang).toBe(code === 'zh' ? 'zh-Hans' : code);
  });
  it('保存失敗では元の言語を維持する', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('容量不足');
    });
    expect(setLanguage('fr')).toBe(false);
    expect(getLanguage()).toBe('ja');
  });
  it('無効な保存値では端末言語へ戻り、起動を妨げない', () => {
    localStorage.setItem('calendar-app.language', 'invalid');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX']);
    initLanguage();
    expect(getLanguage()).toBe('es');
  });
  it('件名などの差し込み値を翻訳せず、そのまま保持する', () => {
    applyLanguage('en');
    const text = t('「{0}」を削除しました', ['予定を追加']);
    expect(text).toContain('予定を追加');
    expect(text).not.toContain('を削除しました');
  });
  it('日付と曜日が選択言語に切り替わる', () => {
    applyLanguage('en');
    expect(formatMonthTitle('2026-09-17')).toBe('September 2026');
    expect(formatDayTitle('2026-09-17')).toContain('Sep');
    expect(weekdayLabels()[0]).toBe('Sun');
    applyLanguage('fr');
    expect(formatMonthTitle('2026-09-17')).toBe('septembre 2026');
    expect(weekdayLabels()[0]).toBe('dim.');
  });
  it('全固定文言に5言語の訳があり、差し込み番号と数が一致する', () => {
    const slots = (value: string) => (value.match(/\{\d+\}/g) ?? []).sort();
    for (const key of sourceKeys) {
      expect(catalog[key], key).toHaveLength(5);
      for (const translation of catalog[key]!) {
        expect(translation.trim(), key).not.toBe('');
        expect(slots(translation), key).toEqual(slots(key));
      }
    }
  });
});
