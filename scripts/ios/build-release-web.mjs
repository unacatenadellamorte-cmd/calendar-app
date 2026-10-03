import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { validateDeviceEnv } from './build-device-web.mjs';

class ReleaseConfigError extends Error {}

const clientPattern = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
const publicKeys = new Set([
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_GOOGLE_OAUTH_CLIENT_ID',
  'VITE_ADMOB_PLATFORM', 'VITE_ADMOB_MODE', 'VITE_ADMOB_IOS_BANNER_ID',
  'VITE_ADMOB_ANDROID_BANNER_ID', 'VITE_PRIVACY_POLICY_URL',
  'VITE_ADMOB_DEBUG_EEA', 'VITE_ADMOB_TEST_DEVICE_IDS',
  'VITE_REVENUECAT_IOS_KEY',
]);

/** 公開設定だけを許可し、値そのものはエラーやログへ出さない。 */
export function validateReleaseEnv(env) {
  let connection;
  try { connection = validateDeviceEnv(env); } catch (error) { throw new ReleaseConfigError(error.message); }
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && !publicKeys.has(name) && env[name]) {
      throw new ReleaseConfigError('許可されていないVITE公開設定があります。');
    }
  }
  for (const name of ['VITE_GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID', 'GOOGLE_SERVER_CLIENT_ID']) {
    if (!clientPattern.test(env[name] || '')) throw new ReleaseConfigError(`${name}が不足または不正です。`);
  }
  if (env.GOOGLE_SERVER_CLIENT_ID !== env.VITE_GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_IOS_CLIENT_ID === env.GOOGLE_SERVER_CLIENT_ID) {
    throw new ReleaseConfigError('GoogleのiOS用IDとサーバー用IDの対応が不正です。');
  }
  if (env.GOOGLE_IOS_REVERSED_CLIENT_ID !== env.GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.')) {
    throw new ReleaseConfigError('Google iOSの逆順URLスキームが一致しません。');
  }
  if (env.VITE_ADMOB_PLATFORM !== 'ios' || env.VITE_ADMOB_MODE !== 'production') {
    throw new ReleaseConfigError('公開ビルドにはiOSの本番広告設定が必要です。');
  }
  if (!/^appl_[A-Za-z0-9_-]+$/.test(env.VITE_REVENUECAT_IOS_KEY || '')) {
    throw new ReleaseConfigError('iOS課金の公開キーが不足または不正です。');
  }
  if (!/^ca-app-pub-\d{16}~\d{10}$/.test(env.ADMOB_IOS_APP_ID || '') ||
      !/^ca-app-pub-\d{16}\/\d{10}$/.test(env.VITE_ADMOB_IOS_BANNER_ID || '') ||
      env.ADMOB_IOS_APP_ID.startsWith('ca-app-pub-3940256099942544') ||
      env.VITE_ADMOB_IOS_BANNER_ID.startsWith('ca-app-pub-3940256099942544') ||
      env.ADMOB_IOS_APP_ID === env.ADMOB_ANDROID_APP_ID ||
      env.VITE_ADMOB_IOS_BANNER_ID === env.VITE_ADMOB_ANDROID_BANNER_ID ||
      !['', 'false', undefined].includes(env.VITE_ADMOB_DEBUG_EEA) || env.VITE_ADMOB_TEST_DEVICE_IDS?.trim()) {
    throw new ReleaseConfigError('本番AdMob設定が不足しているか、テスト・Android用の値が含まれています。');
  }
  let privacy;
  try { privacy = new URL(env.VITE_PRIVACY_POLICY_URL); } catch { throw new ReleaseConfigError('公開ポリシーURLが必要です。'); }
  if (privacy.protocol !== 'https:' || privacy.username || privacy.password) throw new ReleaseConfigError('公開ポリシーURLが不正です。');
  return connection;
}

export function validateReleaseVersion(version, buildNumber) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '') ||
      !/^[1-9]\d{0,8}$/.test(buildNumber || '')) throw new ReleaseConfigError('versionは整数3区切り、buildは1〜9桁の正の整数が必要です。');
}

export async function buildReleaseWeb() {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
  const { url, key } = validateReleaseEnv(env);
  validateReleaseVersion(env.IOS_RELEASE_VERSION, env.IOS_RELEASE_BUILD);
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  }).catch(() => { throw new ReleaseConfigError('Supabase接続確認の通信に失敗しました。'); });
  if (!response.ok) throw new ReleaseConfigError(`Supabase接続確認に失敗しました（HTTP ${response.status}）。`);
  if ((await response.json()).external?.email !== true) throw new ReleaseConfigError('Supabaseのメール認証が有効ではありません。');
  for (const name of publicKeys) if (env[name] !== undefined) process.env[name] = env[name];
  process.env.ADMOB_IOS_APP_ID = env.ADMOB_IOS_APP_ID;
  const previousNativeTarget = process.env.VITE_NATIVE_TARGET;
  try {
    process.env.VITE_NATIVE_TARGET = 'ios';
    await build({ mode: 'production', build: { sourcemap: false } });
  } finally {
    if (previousNativeTarget === undefined) delete process.env.VITE_NATIVE_TARGET;
    else process.env.VITE_NATIVE_TARGET = previousNativeTarget;
  }
  const ads = JSON.parse(await readFile('dist/admob-config.json', 'utf8'));
  if (ads.platform !== 'ios' || ads.mode !== 'production' || ads.appId !== env.ADMOB_IOS_APP_ID ||
      ads.bannerId !== env.VITE_ADMOB_IOS_BANNER_ID || ads.debugEea || ads.testDeviceIds.length) {
    throw new ReleaseConfigError('成果物の広告設定が本番設定と一致しません。');
  }
  const names = await readdir('dist/assets');
  const scripts = (await Promise.all(names.filter((name) => name.endsWith('.js')).map((name) => readFile(`dist/assets/${name}`, 'utf8')))).join('');
  if (![url, key, env.VITE_GOOGLE_OAUTH_CLIENT_ID, env.VITE_REVENUECAT_IOS_KEY].every((value) => scripts.includes(value))) {
    throw new ReleaseConfigError('公開接続設定が成果物へ組み込まれていません。');
  }
  console.log('iOS公開用Webビルド: 接続設定・本番広告・Google設定を検証済み。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildReleaseWeb().catch((error) => {
    // URL・入力値を含み得る外部例外は表示しない。検証エラーは項目名だけを持つ。
    const message = error instanceof ReleaseConfigError ? error.message : 'iOS公開用Webビルドに失敗しました。';
    console.error(message); process.exitCode = 1;
  });
}
