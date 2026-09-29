import { describe, expect, it } from 'vitest';
import { resolveAdsConfig } from '../../scripts/admob-config';

const productionIds = {
  ADMOB_ANDROID_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
  VITE_ADMOB_ANDROID_BANNER_ID: 'ca-app-pub-1234567890123456/1234567890',
  VITE_PRIVACY_POLICY_URL: 'https://example.com/privacy',
};

describe('resolveAdsConfig', () => {
  it('iOS検証はAndroidの環境値が存在しても公式iOS IDだけを使う', () => {
    expect(resolveAdsConfig({ VITE_ADMOB_PLATFORM: 'ios', ...productionIds })).toMatchObject({
      platform: 'ios', mode: 'test',
      appId: 'ca-app-pub-3940256099942544~1458002511',
      bannerId: 'ca-app-pub-3940256099942544/2435281174',
    });
  });

  it('iOS本番では専用IDが必須でAndroid IDを流用しない', () => {
    const env = { VITE_ADMOB_PLATFORM: 'ios', VITE_ADMOB_MODE: 'production', ...productionIds };
    expect(() => resolveAdsConfig(env)).toThrow();
    expect(() => resolveAdsConfig({ ...env, ADMOB_IOS_APP_ID: productionIds.ADMOB_ANDROID_APP_ID,
      VITE_ADMOB_IOS_BANNER_ID: productionIds.VITE_ADMOB_ANDROID_BANNER_ID })).toThrow(/流用/);
    expect(resolveAdsConfig({ ...env, ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~9876543210',
      VITE_ADMOB_IOS_BANNER_ID: 'ca-app-pub-1234567890123456/9876543210' })).toMatchObject({ platform: 'ios', mode: 'production' });
    expect(() => resolveAdsConfig({ VITE_ADMOB_PLATFORM: 'unknown' })).toThrow(/対象/);
  });
  it('iOSテストでは自分のUMP App IDを使い、広告ユニットは公式テストIDに固定する', () => {
    expect(resolveAdsConfig({ VITE_ADMOB_PLATFORM: 'ios', VITE_ADMOB_MODE: 'test',
      ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~9876543210',
      VITE_ADMOB_IOS_BANNER_ID: 'ca-app-pub-1234567890123456/9876543210',
      VITE_ADMOB_DEBUG_EEA: 'true', VITE_ADMOB_TEST_DEVICE_IDS: 'ios-device',
    })).toMatchObject({ appId: 'ca-app-pub-1234567890123456~9876543210',
      bannerId: 'ca-app-pub-3940256099942544/2435281174', debugEea: true, testDeviceIds: ['ios-device'] });
  });
  it.each(['test', 'production'])('iOSの%sモードでもAndroid App IDを拒否する', (mode) => {
    const env = { VITE_ADMOB_PLATFORM: 'ios', VITE_ADMOB_MODE: mode, ...productionIds };
    expect(() => resolveAdsConfig({ ...env, ADMOB_IOS_APP_ID: 'ca-app-pub-3940256099942544~3347511713' })).toThrow(/流用/);
    expect(() => resolveAdsConfig({ ...env, ADMOB_IOS_APP_ID: productionIds.ADMOB_ANDROID_APP_ID })).toThrow(/流用/);
  });

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
