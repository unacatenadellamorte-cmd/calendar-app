import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 2026-09-17のユーザー決定: 表示名は「Multi calendar」、識別子は jp.ryo.multicalendar。
 * App Groupも同じ識別子に揃える。既存リンクのスキーム calendar-app は維持する。
 */
const config: CapacitorConfig = {
  appId: 'jp.ryo.multicalendar',
  appName: 'Multi calendar',
  // Vite のビルド出力(vite.config.ts の既定 outDir)とそろえる。
  webDir: 'dist',
  // Androidのみ広告対応。将来のiOS同期でも広告SDKを組み込まない。
  ios: {
    includePlugins: [
      '@capacitor/app', '@capacitor/app-launcher', '@capacitor/local-notifications',
      '@ebarooni/capacitor-calendar', 'capacitor-widget-bridge',
    ],
  },
};

export default config;
