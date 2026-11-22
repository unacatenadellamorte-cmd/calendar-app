import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_APP_GLASS_TRANSPARENCY,
  DEFAULT_WIDGET_GLASS_TRANSPARENCY,
  applyAppGlassTransparency,
  normalizeGlassTransparency,
  readStoredAppGlassTransparency,
  readStoredWidgetGlassTransparency,
} from './glassAppearance';
import { initTheme } from './useTheme';
import { buildWidgetAppearance } from '@/platform/widgetAppearance';

describe('glassAppearance', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
  });

  it('数値と数値文字列を0〜100の整数へ正規化する', () => {
    expect(normalizeGlassTransparency(42.4, 70)).toBe(42);
    expect(normalizeGlassTransparency('55', 70)).toBe(55);
    expect(normalizeGlassTransparency(-10, 70)).toBe(0);
    expect(normalizeGlassTransparency(140, 70)).toBe(100);
  });

  it.each([null, undefined, '', 'abc', NaN, Infinity, {}, true])('不正値 %s は既定値になる', (value) => {
    expect(normalizeGlassTransparency(value, 70)).toBe(70);
  });

  it('保存が無い・壊れている場合は既定値(アプリ70%/ウィジェット35%)', () => {
    expect(readStoredAppGlassTransparency()).toBe(DEFAULT_APP_GLASS_TRANSPARENCY);
    expect(readStoredWidgetGlassTransparency()).toBe(DEFAULT_WIDGET_GLASS_TRANSPARENCY);
    localStorage.setItem('calendar-app.glass-app-transparency', 'broken');
    localStorage.setItem('calendar-app.glass-widget-transparency', '999');
    expect(readStoredAppGlassTransparency()).toBe(70);
    expect(readStoredWidgetGlassTransparency()).toBe(100);
  });

  it('アプリの透過度をCSS変数 --glass-clear(0〜1)へ反映する', () => {
    applyAppGlassTransparency(25);
    expect(document.documentElement.style.getPropertyValue('--glass-clear')).toBe('0.25');
    applyAppGlassTransparency(0);
    expect(document.documentElement.style.getPropertyValue('--glass-clear')).toBe('0');
  });

  it('再起動時(initTheme)に保存済みの透過度を復元する', () => {
    localStorage.setItem('calendar-app.theme', 'glass');
    localStorage.setItem('calendar-app.glass-app-transparency', '15');
    initTheme();
    expect(document.documentElement.style.getPropertyValue('--glass-clear')).toBe('0.15');
    expect(document.documentElement.dataset.theme).toBe('glass');
  });

  it('ウィジェットのペイロードへ保存済み透過度を載せ、欠損時は既定値', () => {
    expect(buildWidgetAppearance('glass').widgetTransparency).toBe(35);
    localStorage.setItem('calendar-app.glass-widget-transparency', '80');
    expect(buildWidgetAppearance('glass')).toMatchObject({ schemaVersion: 1, theme: 'glass', widgetTransparency: 80 });
    expect(buildWidgetAppearance('glass', undefined, -3).widgetTransparency).toBe(0);
  });
});
