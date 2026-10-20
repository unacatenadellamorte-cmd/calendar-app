import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 模擬するのは OS との境界(Capacitor のネイティブ橋)だけ。
const nativePlugin = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  listAssets: vi.fn(),
  loadImage: vi.fn(),
  cancelLoads: vi.fn(async () => {}),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => nativePlugin,
}));

import {
  DEVICE_PHOTOS_ENABLED_STORAGE_KEY,
  readStoredDevicePhotosEnabled,
  resetDevicePhotosEnabledForTests,
  useDevicePhotosEnabled,
} from './useDevicePhotosEnabled';

beforeEach(() => {
  window.localStorage.clear();
  resetDevicePhotosEnabledForTests();
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe('useDevicePhotosEnabled', () => {
  it('既定値はOFFで、不正値もOFF。保存した真偽値だけ復元する', () => {
    expect(readStoredDevicePhotosEnabled()).toBe(false);
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'invalid');
    expect(readStoredDevicePhotosEnabled()).toBe(false);
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    expect(readStoredDevicePhotosEnabled()).toBe(true);
  });

  it('設定を保存し、再起動(再読込)後も保持する。写真APIは呼ばない', () => {
    const { result, unmount } = renderHook(() => useDevicePhotosEnabled());
    expect(result.current.devicePhotosEnabled).toBe(false);
    act(() => result.current.setDevicePhotosEnabled(true));
    expect(window.localStorage.getItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY)).toBe('true');
    unmount();
    resetDevicePhotosEnabledForTests();
    const reloaded = renderHook(() => useDevicePhotosEnabled());
    expect(reloaded.result.current.devicePhotosEnabled).toBe(true);
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
  });

  it('OFFにした瞬間に実行中の読込を取り消して解放する。ONでは何もしない', () => {
    const { result } = renderHook(() => useDevicePhotosEnabled());
    act(() => result.current.setDevicePhotosEnabled(true));
    expect(nativePlugin.cancelLoads).not.toHaveBeenCalled();
    act(() => result.current.setDevicePhotosEnabled(false));
    expect(nativePlugin.cancelLoads).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY)).toBe('false');
  });

  it('保存できなくても、画面移動後を含むセッション内は設定を保持する', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('保存不可'); });
    const first = renderHook(() => useDevicePhotosEnabled());
    const second = renderHook(() => useDevicePhotosEnabled());
    act(() => first.result.current.setDevicePhotosEnabled(true));
    expect(window.localStorage.getItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY)).toBeNull();
    expect(second.result.current.devicePhotosEnabled).toBe(true);
    first.unmount();
    const next = renderHook(() => useDevicePhotosEnabled());
    expect(next.result.current.devicePhotosEnabled).toBe(true);
  });

  it('別タブの変更・削除・全消去を同期し、OFFへの変更では解放する。無関係なキーとsessionStorageは無視する', () => {
    const { result } = renderHook(() => useDevicePhotosEnabled());
    const emit = (key: string | null, newValue: string | null, storageArea = window.localStorage) => {
      act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea })));
    };
    emit(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    expect(result.current.devicePhotosEnabled).toBe(true);
    emit('unrelated', 'false');
    emit(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'false', window.sessionStorage);
    expect(result.current.devicePhotosEnabled).toBe(true);
    expect(nativePlugin.cancelLoads).not.toHaveBeenCalled();
    emit(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, null);
    expect(result.current.devicePhotosEnabled).toBe(false);
    expect(nativePlugin.cancelLoads).toHaveBeenCalledTimes(1);
    emit(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    emit(null, null);
    expect(result.current.devicePhotosEnabled).toBe(false);
  });
});
