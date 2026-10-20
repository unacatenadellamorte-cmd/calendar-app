// 作成直後の専用エミュレーターへ、架空画像だけを登録する。実機・既存写真には触れない。
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const adb = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const serial = 'emulator-5580';
const shell = command => execFileSync(adb, ['-s', serial, 'shell', command], { encoding: 'utf8' }).trim();
if (shell('getprop ro.kernel.qemu') !== '1' || !shell('getprop ro.boot.qemu.avd_name').includes('MultiCalendar_Photos_20261020')) throw new Error('専用エミュレーター以外には登録しません。');
if (!process.argv[2]) throw new Error('日時付き架空画像のフォルダーを指定してください。');
shell('mkdir -p /sdcard/Pictures/MultiCalendarQA');
const existing = shell("find /sdcard/Pictures/MultiCalendarQA -maxdepth 1 -type f -name 'QA_EXIF_*' -print");
if (existing) throw new Error('既存のQA_EXIF_画像があるため、重複登録せず停止しました。既存画像は削除せず、専用AVDの状態を確認してから再実行してください。');
for (const name of ['start', 'middle', 'end', 'before', 'after']) {
  execFileSync(adb, ['-s', serial, 'push', resolve(process.argv[2], `20261020_photo-qa-${name}.jpg`), `/data/local/tmp/photo-qa-${name}.jpg`]);
}
const batch = Date.now();
const commands = [];
for (let i = 0; i < 122; i++) {
  const source = i === 0 ? 'start' : i === 119 ? 'end' : i === 120 ? 'before' : i === 121 ? 'after' : 'middle';
  const target = `/sdcard/Pictures/MultiCalendarQA/QA_EXIF_${batch}_${i}.jpg`;
  commands.push(`cp /data/local/tmp/photo-qa-${source}.jpg ${target} && am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${target} >/dev/null`);
}
shell(commands.join(' && '));
console.log('日時付き架空画像122枚をOSへ取り込み要求しました。日時不明画像は別途残しています。');
