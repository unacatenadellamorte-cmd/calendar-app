/**
 * ネイティブ版更新時に、旧Web/PWA版のService Workerとキャッシュを一度だけ掃除する。
 * Viteの公開ビルドではVITE_NATIVE_TARGETが未設定なので実行されない。
 */
export async function cleanupNativeServiceWorker(reload = () => window.location.reload()): Promise<void> {
  const target = import.meta.env.VITE_NATIVE_TARGET;
  if (target !== 'android' && target !== 'ios') return;
  if (!('serviceWorker' in navigator)) return;

  const marker = 'multi-calendar-native-sw-cleaned-v1';
  if (localStorage.getItem(marker) === '1') return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  const cacheNames = 'caches' in window ? await caches.keys() : [];
  const hasLegacyState = registrations.length > 0 || cacheNames.length > 0;
  await Promise.all(registrations.map((registration) => registration.unregister()));
  await Promise.all(cacheNames.map((name) => caches.delete(name)));
  localStorage.setItem(marker, '1');
  if (hasLegacyState) reload();
}
