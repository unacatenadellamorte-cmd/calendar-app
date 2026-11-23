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
    for (const theme of ['sakura', 'leaf', 'ocean', 'lavender', 'glass', 'gold', 'silver'] as const) {
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
    // ガラスは明るい曇りガラスの上部面なので、濃いアイコンと濃い文字にする。
    applyTheme('glass');
    expect(setStyle).toHaveBeenLastCalledWith({ style: SystemBarsStyle.Light });
    expect(document.documentElement.style.getPropertyValue('--color-chrome-ink')).toBe('#14283a');
    expect(Capacitor.isNativePlatform).toHaveBeenCalled();
  });
  it('ゴールドは黒っぽいブロンズの帯に白文字、シルバーは明るい銀の帯に濃い文字', () => {
    const setStyle = vi.mocked(SystemBars.setStyle);
    applyTheme('gold');
    expect(setStyle).toHaveBeenLastCalledWith({ style: SystemBarsStyle.Dark });
    expect(document.documentElement.style.getPropertyValue('--color-chrome-surface')).toBe('#3a2911');
    expect(document.documentElement.style.getPropertyValue('--color-chrome-ink')).toBe('#fff4dc');
    expect(document.documentElement.style.colorScheme).toBe('light');
    applyTheme('silver');
    expect(setStyle).toHaveBeenLastCalledWith({ style: SystemBarsStyle.Light });
    expect(document.documentElement.style.getPropertyValue('--color-chrome-surface')).toBe('#d3d7dd');
    expect(document.documentElement.style.getPropertyValue('--color-chrome-ink')).toBe('#16191e');
    // 既存テーマの値は変えない。
    applyTheme('sakura');
    expect(setStyle).toHaveBeenLastCalledWith({ style: SystemBarsStyle.Dark });
    expect(document.documentElement.style.getPropertyValue('--color-chrome-ink')).toBe('#ffffff');
  });
  it('不明な保存値(例: 旧版にない名前)はsystemへ戻す', () => {
    window.localStorage.setItem('calendar-app.theme', 'platinum');
    expect(readStoredTheme()).toBe('system');
  });
});
