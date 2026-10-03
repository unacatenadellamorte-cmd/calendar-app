/** ネイティブ配布用Service Workerが自己破棄契約を含むことを検証する。 */
export function assertSelfDestroyingServiceWorker(source) {
  if (!/registration\.unregister\s*\(/.test(source) ||
      !/caches\.keys\s*\(/.test(source) ||
      !/caches\.delete\s*\(/.test(source)) {
    throw new Error('ネイティブ配布用Service Workerに自己破棄契約がありません。');
  }
}
