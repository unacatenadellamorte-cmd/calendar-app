export interface AdsConfig {
  mode: 'test' | 'production';
  appId: string;
  bannerId: string;
  privacyUrl: string;
  debugEea: boolean;
  testDeviceIds: string[];
}

/** WebとAndroidManifestのIDを同じビルド設定から生成する。 */
export function resolveAdsConfig(env: Record<string, string | undefined>): AdsConfig {
  const mode = env.VITE_ADMOB_MODE || 'test';
  if (mode !== 'test' && mode !== 'production') throw new Error('広告モードが不正です。');
  const testAppId = 'ca-app-pub-3940256099942544~3347511713';
  const testBannerId = 'ca-app-pub-3940256099942544/9214589741';
  const appId = env.ADMOB_ANDROID_APP_ID || testAppId;
  const bannerId = mode === 'test' ? testBannerId : env.VITE_ADMOB_ANDROID_BANNER_ID || '';
  const privacyUrl = env.VITE_PRIVACY_POLICY_URL || '';
  const debugEea = env.VITE_ADMOB_DEBUG_EEA === 'true';
  const testDeviceIds = (env.VITE_ADMOB_TEST_DEVICE_IDS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!/^ca-app-pub-\d{16}~\d{10}$/.test(appId) || !/^ca-app-pub-\d{16}\/\d{10}$/.test(bannerId)) {
    throw new Error('AdMobのApp IDまたはバナーIDが不正です。');
  }
  if (privacyUrl && new URL(privacyUrl).protocol !== 'https:') throw new Error('公開ポリシーにはHTTPS URLが必要です。');
  if (mode === 'production' && (appId.startsWith('ca-app-pub-3940256099942544') || bannerId.startsWith('ca-app-pub-3940256099942544') || !privacyUrl || debugEea || testDeviceIds.length)) {
    throw new Error('本番広告には本番IDと公開ポリシーURLが必要です。テスト地域・端末設定は外してください。');
  }
  return { mode, appId, bannerId, privacyUrl, debugEea, testDeviceIds };
}
