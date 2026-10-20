import { useSyncExternalStore } from 'react';
import { releaseDevicePhotoCache } from '@/platform/devicePhotos';

/** カレンダーに端末の写真を表示する設定。既定はOFF。端末内に真偽値だけを保存する。 */
export const DEVICE_PHOTOS_ENABLED_STORAGE_KEY = 'calendar-app.device-photos-enabled';

export function readStoredDevicePhotosEnabled(): boolean {
  try {
    return window.localStorage.getItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let current: boolean | undefined;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
const getSnapshot = () => current ?? (current = readStoredDevicePhotosEnabled());

// 別タブからの変更・削除・全消去を受け取る、アプリ全体で一つのストア。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== DEVICE_PHOTOS_ENABLED_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    current = event.key !== null && event.newValue === 'true';
    if (!current) releaseDevicePhotoCache();
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setDevicePhotosEnabled(next: boolean): void {
  current = next;
  // OFF は画面が開いていなくても即座に、実行中の要求と読込済みの画像を解放する。
  if (!next) releaseDevicePhotoCache();
  try {
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, String(next));
  } catch {
    // 保存できなくても共有メモリを保ち、画面移動後にも設定を反映する。
  }
  notify();
}

/** テスト用: 次の購読時にストレージから初期化し直す。 */
export function resetDevicePhotosEnabledForTests(): void {
  current = undefined;
  notify();
}

export function useDevicePhotosEnabled(): {
  devicePhotosEnabled: boolean;
  setDevicePhotosEnabled: (next: boolean) => void;
} {
  const devicePhotosEnabled = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return { devicePhotosEnabled, setDevicePhotosEnabled };
}
