import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import {
  nativeStoreContractPlugin,
  assertIosStoreContract,
} from '../native-store-contract.mjs';

test('iOSから他ストア専用の翻訳を除き、Google Calendarと6言語を維持する', async () => {
  const plugin = nativeStoreContractPlugin('ios');
  for (const language of ['en', 'zh', 'ko', 'es', 'fr', 'source-keys']) {
    const path = `/src/i18n/${language}.json`;
    const source = await readFile(new URL(`../..${path}`, import.meta.url), 'utf8');
    const filtered = plugin.transform(source, path);
    assertIosStoreContract(filtered);
    assert.match(filtered, /App Store/);
    assert.match(filtered, /Google/);
  }
});

test('AndroidとWebの導線を維持し、iOSのビルド済みコードに他ストアを残さない', async () => {
  const entry = fileURLToPath(
    new URL('../../src/features/billing/ui/SubscriptionNotice.tsx', import.meta.url),
  );
  for (const target of ['ios', 'android', undefined]) {
    const plugin = nativeStoreContractPlugin(target);
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [plugin],
      build: {
        write: false,
        minify: true,
        lib: { entry, formats: ['es'] },
        rollupOptions: { external: (id) => id.startsWith('@') || id === 'react/jsx-runtime' },
      },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const code = bundles
      .flatMap((bundle) => bundle.output)
      .map((entry) => (entry.type === 'chunk' ? entry.code : ''))
      .join('');
    // JSXの変換を含む、実際のRollup出力を検査する。
    if (target === 'ios') assertIosStoreContract(code);
    else assert.match(code, /play\.google\.com/);
    if (target !== 'android') assert.match(code, /apps\.apple\.com/);
  }
});

test('他ストア文言とURLは拒否し、カレンダー連携は許可する', () => {
  assertIosStoreContract('App Store; Google Calendar');
  for (const source of [
    'Google Play',
    'https://play.google.com/store/account/subscriptions',
  ]) {
    assert.throws(() => assertIosStoreContract(source));
  }
});
