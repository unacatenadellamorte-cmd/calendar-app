import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('light / dark は data-theme を設定し、system は属性を外す', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
