import { afterEach, describe, expect, it, vi } from 'vitest';

const marker = 'multi-calendar-native-sw-cleaned-v1';

async function loadCleanup(target: string) {
  vi.resetModules();
  vi.stubEnv('VITE_NATIVE_TARGET', target);
  return (await import('./nativeServiceWorkerCleanup')).cleanupNativeServiceWorker;
}

function installServiceWorkerMock(getRegistrations: () => Promise<ServiceWorkerRegistration[]>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
  Reflect.deleteProperty(window, 'caches');
});

describe('ネイティブService Worker掃除', () => {
  it('ネイティブ対象で旧登録・キャッシュを掃除して再読込する', async () => {
    const unregister = vi.fn(async () => true);
    installServiceWorkerMock(async () => [{ unregister } as unknown as ServiceWorkerRegistration]);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn(async () => ['old-cache']), delete: vi.fn(async () => true) },
    });
    const reload = vi.fn();

    await (await loadCleanup('ios'))(reload);

    expect(unregister).toHaveBeenCalledOnce();
    expect(window.caches.delete).toHaveBeenCalledWith('old-cache');
    expect(localStorage.getItem(marker)).toBe('1');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('新規インストールは掃除済みとして記録するが再読込しない', async () => {
    installServiceWorkerMock(async () => []);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn(async () => []), delete: vi.fn() },
    });
    const reload = vi.fn();

    await (await loadCleanup('android'))(reload);

    expect(localStorage.getItem(marker)).toBe('1');
    expect(reload).not.toHaveBeenCalled();
  });

  it('Web対象では何もせず、2回目も掃除しない', async () => {
    const getRegistrations = vi.fn(async () => []);
    installServiceWorkerMock(getRegistrations);
    const cleanup = await loadCleanup('web');
    await cleanup();
    expect(getRegistrations).not.toHaveBeenCalled();

    localStorage.setItem(marker, '1');
    const cleanupAgain = await loadCleanup('ios');
    await cleanupAgain();
    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it('掃除に失敗したらマーカーを残さず次回に再試行できる', async () => {
    const getRegistrations = vi.fn()
      .mockRejectedValueOnce(new Error('一時的な失敗'))
      .mockResolvedValueOnce([]);
    installServiceWorkerMock(getRegistrations);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn(async () => []), delete: vi.fn() },
    });
    const cleanup = await loadCleanup('ios');

    await expect(cleanup()).rejects.toThrow('一時的な失敗');
    expect(localStorage.getItem(marker)).toBeNull();
    await cleanup();
    expect(getRegistrations).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(marker)).toBe('1');
  });
});
