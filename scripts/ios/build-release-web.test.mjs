import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseEnv, validateReleaseVersion } from './build-release-web.mjs';

const valid = {
  VITE_SUPABASE_URL: 'https://release.example.test', VITE_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
  VITE_GOOGLE_OAUTH_CLIENT_ID: '123-server.apps.googleusercontent.com',
  GOOGLE_SERVER_CLIENT_ID: '123-server.apps.googleusercontent.com',
  GOOGLE_IOS_CLIENT_ID: '123-ios.apps.googleusercontent.com',
  GOOGLE_IOS_REVERSED_CLIENT_ID: 'com.googleusercontent.apps.123-ios',
  VITE_ADMOB_PLATFORM: 'ios', VITE_ADMOB_MODE: 'production',
  ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
  VITE_ADMOB_IOS_BANNER_ID: 'ca-app-pub-1234567890123456/1234567890',
  VITE_PRIVACY_POLICY_URL: 'https://release.example.test/privacy',
};

test('公開設定を全項目揃えた場合だけ通す', () => {
  assert.equal(validateReleaseEnv(valid).url, valid.VITE_SUPABASE_URL);
  for (const key of Object.keys(valid)) {
    assert.throws(() => validateReleaseEnv({ ...valid, [key]: '' }), undefined, key);
  }
});

test('テスト広告・誤ったGoogle ID・管理者キー・不明な公開キーを拒否する', () => {
  for (const changes of [
    { VITE_ADMOB_MODE: 'test' }, { VITE_ADMOB_PLATFORM: 'android' },
    { ADMOB_IOS_APP_ID: 'ca-app-pub-3940256099942544~1458002511' },
    { VITE_ADMOB_IOS_BANNER_ID: 'ca-app-pub-3940256099942544/2435281174' },
    { VITE_ADMOB_DEBUG_EEA: 'true' }, { VITE_ADMOB_TEST_DEVICE_IDS: 'test-device' },
    { GOOGLE_SERVER_CLIENT_ID: '123-other.apps.googleusercontent.com' },
    { GOOGLE_IOS_REVERSED_CLIENT_ID: 'wrong-scheme' },
    { GOOGLE_IOS_CLIENT_ID: valid.GOOGLE_SERVER_CLIENT_ID },
    { VITE_SUPABASE_ANON_KEY: 'sb_secret_should-never-be-logged' },
    { VITE_PRIVATE_SECRET: 'should-never-be-logged' },
    { VITE_PRIVACY_POLICY_URL: 'https://user:password@example.test' },
  ]) {
    assert.throws(() => validateReleaseEnv({ ...valid, ...changes }), (error) => !error.message.includes('should-never-be-logged'));
  }
});

test('手動入力をシェルへ渡す前に検証する', () => {
  validateReleaseVersion('1.0.20', '21');
  for (const [version, number] of [['', '1'], ['1.2', '1'], ['1.2.3; echo bad', '1'], ['1.2.3', '0'], ['1.2.3', '1\n'], ['1.2.3', '1; echo bad'], ['1.2.3', '1000000000']]) {
    assert.throws(() => validateReleaseVersion(version, number));
  }
});
