import { describe, expect, it } from 'vitest';
import { resolveAdsConfig } from '../../scripts/admob-config';

const productionIds = {
  ADMOB_ANDROID_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
  VITE_ADMOB_ANDROID_BANNER_ID: 'ca-app-pub-1234567890123456/1234567890',
  VITE_PRIVACY_POLICY_URL: 'https://example.com/privacy',
};

describe('resolveAdsConfig', () => {
  it('既定値は公式の AdMob テストIDを使う', () => {
    expect(resolveAdsConfig({})).toMatchObject({
      mode: 'test',
      appId: 'ca-app-pub-3940256099942544~3347511713',
      bannerId: 'ca-app-pub-3940256099942544/9214589741',
    });
  });

  it('本番モードは本番IDとHTTPS公開ポリシーURLを必須にする', () => {
    expect(resolveAdsConfig({ VITE_ADMOB_MODE: 'production', ...productionIds })).toMatchObject({
      mode: 'production',
      appId: productionIds.ADMOB_ANDROID_APP_ID,
      bannerId: productionIds.VITE_ADMOB_ANDROID_BANNER_ID,
      privacyUrl: productionIds.VITE_PRIVACY_POLICY_URL,
    });
    expect(() => resolveAdsConfig({ VITE_ADMOB_MODE: 'production' })).toThrow();
    expect(() => resolveAdsConfig({
      VITE_ADMOB_MODE: 'production',
      ...productionIds,
      VITE_PRIVACY_POLICY_URL: 'http://example.com/privacy',
    })).toThrow(/HTTPS/);
  });

  it('本番モードではテストID・debug地域・テスト端末を許可しない', () => {
    expect(() => resolveAdsConfig({
      VITE_ADMOB_MODE: 'production',
      ...productionIds,
      VITE_ADMOB_DEBUG_EEA: 'true',
    })).toThrow();
    expect(() => resolveAdsConfig({
      VITE_ADMOB_MODE: 'production',
      ...productionIds,
      VITE_ADMOB_TEST_DEVICE_IDS: 'device-1',
    })).toThrow();
  });

  it('テストモードのdebug地域とテスト端末は明示時だけ有効にする', () => {
    expect(resolveAdsConfig({
      VITE_ADMOB_DEBUG_EEA: 'true',
      VITE_ADMOB_TEST_DEVICE_IDS: 'a, b',
    })).toMatchObject({ debugEea: true, testDeviceIds: ['a', 'b'] });
  });
});
