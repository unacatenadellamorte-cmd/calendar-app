import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';

export type MapApp = 'google' | 'apple' | 'system';
const MAP_APP_KEY = 'calendar-app.map-app';

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
}

async function launchUrl(url: string, validate = true): Promise<boolean> {
  if (validate && !isAllowedExternalUrl(url)) return false;
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await AppLauncher.openUrl({ url });
      return result.completed === true;
    }
    // ブラウザでは戻り値が popup blocker 等で null になっても、呼び出し自体は
    // 同期に成功している。例外だけを失敗として扱う。
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

export async function openExternalUrl(value: string): Promise<boolean> {
  const url = value.trim();
  return launchUrl(url);
}

export function readMapApp(): MapApp {
  let value: string | null = null;
  try {
    value = typeof localStorage === 'undefined' ? null : localStorage.getItem(MAP_APP_KEY);
  } catch {
    value = null;
  }
  return value === 'apple' || value === 'system' || value === 'google' ? value : 'google';
}

export function setMapApp(value: MapApp): void {
  try {
    localStorage.setItem(MAP_APP_KEY, value);
  } catch {
    // Safariのプライベートモードなど、保存不可でも画面操作は継続する。
  }
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function openMap(location: string, preference = readMapApp()): Promise<boolean> {
  const query = encodeURIComponent(location.trim());
  if (!query) return false;
  let url: string;
  if (preference === 'apple' || (preference === 'system' && isIos())) {
    url = `https://maps.apple.com/?q=${query}`;
  } else if (preference === 'system' && Capacitor.isNativePlatform()) {
    url = `geo:0,0?q=${query}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  return launchUrl(url, false);
}
