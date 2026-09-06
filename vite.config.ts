/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA は Story 1.6 で有効化する。ここではプラグインを読み込むだけで
    // Service Worker の登録・生成はしない(injectRegister: null / selfDestroying)。
    VitePWA({
      disable: true,
      injectRegister: null,
      registerType: 'prompt',
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
  },
});
