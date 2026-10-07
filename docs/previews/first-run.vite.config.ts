import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 一般アプリの設定とは分離し、確認画面のデータ層を必ず架空実装へ差し替える。
export default defineConfig({
  define: { 'import.meta.env.FIRST_RUN_PREVIEW': 'true' },
  optimizeDeps: { entries: ['docs/previews/first-run.html'] },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@\/data\/(auth|connections|google-calendars|env)$/,
        replacement: fileURLToPath(new URL('./first-run-stubs.ts', import.meta.url)),
      },
      {
        find: '@core',
        replacement: fileURLToPath(
          new URL('../../packages/core/src/index.ts', import.meta.url),
        ),
      },
      { find: '@', replacement: fileURLToPath(new URL('../../src', import.meta.url)) },
    ],
  },
});
