import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
  SystemBars: { setStyle: vi.fn().mockResolvedValue(undefined) },
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { applyTheme, readStoredTheme } from './useTheme';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('readStoredTheme', () => {
  it('保存済みの有効な値を返す', () => {
    window.localStorage.setItem('calendar-app.theme', 'dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('未保存・不正値のときは system を返す', () => {
    expect(readStoredTheme()).toBe('system');
    window.localStorage.setItem('calendar-app.theme', 'bogus');
    expect(readStoredTheme()).toBe('system');
  });

  it('localStorage が例外を投げるときは system にフォールバックする', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });
    expect(readStoredTheme()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('追加配色を保存値から復元し、標準テーマへ戻すと配色を解除する', () => {
    for (const theme of ['sakura', 'leaf', 'ocean', 'lavender'] as const) {
      window.localStorage.setItem('calendar-app.theme', theme);
      applyTheme(readStoredTheme());
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(document.documentElement.style.getPropertyValue('--color-accent')).not.toBe('');
    }
    applyTheme('system');
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('');
  });
  it('light / dark は data-theme を設定し、system は属性を外す', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
  it('濃色テーマはSystemBarsへ白アイコン用のDARKを渡す', () => {
    const setStyle = vi.mocked(SystemBars.setStyle);
    setStyle.mockClear();
    applyTheme('dark');
    expect(setStyle).toHaveBeenCalledWith({ style: SystemBarsStyle.Dark });
    applyTheme('system');
    expect(setStyle).toHaveBeenLastCalledWith({ style: SystemBarsStyle.Dark });
    applyTheme('light');
    expect(setStyle).toHaveBeenLastCalledWith({ style: SystemBarsStyle.Dark });
    expect(Capacitor.isNativePlatform).toHaveBeenCalled();
  });
});
