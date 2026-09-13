import type { CapacitorConfig } from '@capacitor/cli';

/**
 * プロダクト識別子は暫定 `jp.ryo.calendarapp`(ARCHITECTURE-SPINE Epic5 AD-18)。
 * appId・App Group ID・ディープリンクスキーム(`calendar-app`, AD-16)はすべてこの1値から
 * 機械的に導出する。プロダクト名が正式決定したら、この3箇所を同一 PR で同時に変更する。
 */
const config: CapacitorConfig = {
  appId: 'jp.ryo.calendarapp',
  appName: 'カレンダーアプリ(仮)',
  // Vite のビルド出力(vite.config.ts の既定 outDir)とそろえる。
  webDir: 'dist',
};

export default config;
