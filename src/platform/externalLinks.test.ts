import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openUrl, nativeState } = vi.hoisted(() => ({ openUrl: vi.fn(), nativeState: { value: false } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => nativeState.value },
}));
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl } }));

import {
  isAllowedExternalUrl,
  openExternalUrl,
  openMap,
  readMapApp,
  setMapApp,
} from './externalLinks';

describe('externalLinks', () => {
  beforeEach(() => {
    nativeState.value = false;
    openUrl.mockReset();
    vi.restoreAllMocks();
  });

  it('危険な scheme を拒否し、http/https と zoomus だけ許可する', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/plain,x')).toBe(false);
    expect(isAllowedExternalUrl('file:///tmp/a')).toBe(false);
    expect(isAllowedExternalUrl('intent://zoom')).toBe(false);
    expect(isAllowedExternalUrl('https://zoom.us/j/123')).toBe(true);
    expect(isAllowedExternalUrl('zoomus://zoom.us/join?action=join')).toBe(false);
  });

  it('native は AppLauncher の completed と例外を成功判定に使う', async () => {
    nativeState.value = true;
    openUrl.mockResolvedValueOnce({ completed: false });
    await expect(openExternalUrl('https://example.com')).resolves.toBe(false);
    openUrl.mockResolvedValueOnce({ completed: true });
    await expect(openExternalUrl('https://example.com')).resolves.toBe(true);
    openUrl.mockRejectedValueOnce(new Error('no handler'));
    await expect(openExternalUrl('https://example.com')).resolves.toBe(false);
  });

  it('web の地図 URL は選択値ごとに query を encode して生成する', async () => {
    const opened: string[] = [];
    vi.spyOn(window, 'open').mockImplementation((url) => {
      opened.push(String(url));
      return null;
    });
    await expect(openMap('東京駅 / 丸の内', 'google')).resolves.toBe(true);
    await expect(openMap('東京駅', 'apple')).resolves.toBe(true);
    expect(opened[0]).toContain('https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%A7%85%20%2F%20%E4%B8%B8%E3%81%AE%E5%86%85');
    expect(opened[1]).toContain('https://maps.apple.com/?q=%E6%9D%B1%E4%BA%AC%E9%A7%85');
  });

  it('system の native 地図は内部 geo URI を AppLauncher に渡す', async () => {
    nativeState.value = true;
    openUrl.mockResolvedValue({ completed: true });
    await expect(openMap('大阪駅', 'system')).resolves.toBe(true);
    expect(openUrl).toHaveBeenCalledWith({ url: 'geo:0,0?q=%E5%A4%A7%E9%98%AA%E9%A7%85' });
  });

  it('地図アプリ設定を localStorage に保存し、未知値は Google に戻す', () => {
    expect(readMapApp()).toBe('google');
    setMapApp('apple');
    expect(readMapApp()).toBe('apple');
    localStorage.setItem('calendar-app.map-app', 'bad');
    expect(readMapApp()).toBe('google');
  });

  it('localStorage が例外を投げても既定値を返し、設定操作を壊さない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(readMapApp()).toBe('google');
    expect(() => setMapApp('apple')).not.toThrow();
  });
});
