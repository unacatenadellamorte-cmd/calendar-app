/**
 * ネイティブ版更新時に、旧Web/PWA版のService Workerとキャッシュを一度だけ掃除する。
 * Viteの公開ビルドではVITE_NATIVE_TARGETが未設定なので実行されない。
 */
export async function cleanupNativeServiceWorker(): Promise<void> {
  if (!import.meta.env.VITE_NATIVE_TARGET || !('serviceWorker' in navigator)) return;

  const marker = 'multi-calendar-native-sw-cleaned-v1';
  if (localStorage.getItem(marker) === '1') return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
  localStorage.setItem(marker, '1');
  window.location.reload();
}
