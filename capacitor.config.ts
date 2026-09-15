import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 表示名は「マルチカレンダー」に確定(2026-09-15、ユーザー決定)。
 * プロダクト識別子(`appId` = `jp.ryo.calendarapp`)・App Group ID・ディープリンクスキーム
 * (`calendar-app`, AD-16)は ARCHITECTURE-SPINE Epic5 AD-18 のとおり暫定のまま
 * ── 変更するとアプリの再インストール扱いになる等の影響があるため、表示名とは別に
 * 明示的な決定が要る(この3箇所を変えるときは同一 PR で同時に変更する)。
 */
const config: CapacitorConfig = {
  appId: 'jp.ryo.calendarapp',
  appName: 'マルチカレンダー',
  // Vite のビルド出力(vite.config.ts の既定 outDir)とそろえる。
  webDir: 'dist',
};

export default config;
