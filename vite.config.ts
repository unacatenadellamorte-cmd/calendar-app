/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveAdsConfig } from './scripts/admob-config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const ads = resolveAdsConfig({ ...loadEnv(mode, process.cwd(), ''), ...process.env });
  const nativeTarget = process.env.VITE_NATIVE_TARGET;
  const isNativeBuild = nativeTarget === 'android' || nativeTarget === 'ios';
  return ({
  define: { __ADMOB_CONFIG__: JSON.stringify(ads) },
  plugins: [
    {
      name: 'native-admob-config',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'admob-config.json', source: JSON.stringify(ads) });
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      // テスト実行時は Service Worker まわりを無効化する。
      disable: mode === 'test',
      registerType: 'prompt',
      // ネイティブ更新時だけ、旧Webキャッシュを自動的に破棄する。
      selfDestroying: isNativeBuild,
      // 登録は src/app/PwaUpdatePrompt.tsx の useRegisterSW が行う。
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // メール確認の受け皿は事前キャッシュせず、常にネットワークの HTML を使う。
        globIgnores: ['**/node_modules/**/*', '**/auth-confirmation.html'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Supabase の API/Auth は SW でキャッシュしない(表示キャッシュは IndexedDB 一本。AD-1)。
        // 受け皿は GitHub Pages 配下とローカル直下のどちらでも index.html へ差し替えない。
        navigateFallbackDenylist: [/^\/api/, /^(?:\/calendar-app)?\/auth-confirmation\.html(?:\?|$)/],
      },
      manifest: {
        name: 'Multi calendar',
        short_name: 'Multi calendar',
        description: '埋もれないカレンダー。優先度が表示に効く予定アプリ。',
        lang: 'ja',
        dir: 'ltr',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#2563EB',
        background_color: '#FFFFFF',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'packages/*/src/**/*.{test,spec}.ts'],
    // 日付ロジック(月グリッド・TZ 境界)を決定的にするため実行 TZ を固定する。
    env: { TZ: 'Asia/Tokyo' },
    alias: {
      // vitest では解決できない仮想モジュールをスタブへ差し替える。
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
});
});
