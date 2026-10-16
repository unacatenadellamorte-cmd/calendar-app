/** ネイティブ成果物から、他ストア専用の翻訳と導線を除外する。 */
export function nativeStoreContractPlugin(target) {
  return {
    name: 'native-store-contract',
    enforce: 'pre',
    transform(source, id) {
      if (target !== 'ios' && target !== 'android') return;
      const path = id.replaceAll('\\', '/').split('?')[0];
      if (path.endsWith('/SubscriptionNotice.tsx')) {
        return source.replace('Capacitor.getPlatform()', JSON.stringify(target));
      }
      if (/\/src\/i18n\/(?:en|zh|ko|es|fr|source-keys)\.json$/.test(path)) {
        const data = JSON.parse(source);
        const otherStore =
          target === 'ios'
            ? /Google\s*Play|play\.google\.com/i
            : /App\s*Store|apps\.apple\.com/i;
        return JSON.stringify(
          Array.isArray(data)
            ? data.filter((key) => !otherStore.test(key))
            : Object.fromEntries(
                Object.entries(data).filter(
                  ([key, value]) => !otherStore.test(key) && !otherStore.test(value),
                ),
              ),
        );
      }
    },
  };
}

/** iOS成果物に他ストアの文言・リンクが残った場合は配布を止める。 */
export function assertIosStoreContract(source) {
  if (/Google\s*Play|play\.google\.com/i.test(source)) {
    throw new Error('iOS成果物に他ストアの文言またはURLが含まれています。');
  }
}
