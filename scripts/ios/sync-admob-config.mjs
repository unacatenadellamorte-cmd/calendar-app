import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import plist from 'plist';

// Android同期時は既存処理に介入しない。直接実行時はiOS設定の検査・同期を行う。
if (process.env.CAPACITOR_PLATFORM_NAME && process.env.CAPACITOR_PLATFORM_NAME !== 'ios') process.exit(0);
const root = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(readFileSync(resolve(root, 'dist/admob-config.json'), 'utf8'));
if (config.platform !== 'ios') throw new Error('VITE_ADMOB_PLATFORM=iosでWebを再ビルドしてください。');
if (!['test', 'production'].includes(config.mode) ||
    !/^ca-app-pub-\d{16}~\d{10}$/.test(config.appId) || !/^ca-app-pub-\d{16}\/\d{10}$/.test(config.bannerId)) {
  throw new Error('iOS広告設定のモードまたはIDが不正です。');
}
if (config.appId === 'ca-app-pub-3940256099942544~3347511713' || config.appId === process.env.ADMOB_ANDROID_APP_ID ||
    config.bannerId === process.env.VITE_ADMOB_ANDROID_BANNER_ID) throw new Error('iOS広告にAndroidのIDは流用できません。');
if (config.mode === 'test' && config.bannerId !== 'ca-app-pub-3940256099942544/2435281174') {
  throw new Error('iOS検証には公式iOSテストバナーIDが必要です。');
}
if (config.mode === 'production' && (config.appId.startsWith('ca-app-pub-3940256099942544') ||
    config.bannerId.startsWith('ca-app-pub-3940256099942544') || !config.privacyUrl?.startsWith('https://') ||
    config.debugEea || config.testDeviceIds?.length)) throw new Error('iOS本番設定にテスト用の値か不足があります。');
const copied = JSON.parse(readFileSync(resolve(root, 'ios/App/App/public/admob-config.json'), 'utf8'));
if (JSON.stringify(copied) !== JSON.stringify(config)) throw new Error('iOSへコピー済みの広告設定がWebビルドと一致しません。cap sync iosを再実行してください。');

const path = resolve(root, 'ios/App/App/Info.plist');
let xml = readFileSync(path, 'utf8');
const original = plist.parse(xml);
const networks = JSON.parse(readFileSync(resolve(root, 'scripts/ios/skadnetwork-ids.json'), 'utf8'));
const existingNetworks = original.SKAdNetworkItems ?? [];
if (!Array.isArray(existingNetworks)) throw new Error('SKAdNetworkItemsが配列ではありません。');
const items = [...existingNetworks];
for (const id of networks) if (!items.some((item) => item.SKAdNetworkIdentifier === id)) items.push({ SKAdNetworkIdentifier: id });

// 他のキーやコメントは保持し、広告用の3項目だけ置き換える。
function replaceValue(key, value, pattern) {
  const entry = plist.build({ [key]: value }).match(/<dict>\s*([\s\S]*)\s*<\/dict>/)[1].trim();
  const matcher = new RegExp(`<key>${key}</key>\\s*${pattern}`);
  if (Object.hasOwn(original, key)) {
    if (!matcher.test(xml)) throw new Error(`${key}の形式を確認してください。`);
    xml = xml.replace(matcher, entry);
  } else {
    xml = xml.replace(/<\/dict>\s*<\/plist>\s*$/, `  ${entry}\n</dict>\n</plist>\n`);
  }
}
replaceValue('GADApplicationIdentifier', config.appId, '<string>[^<]*</string>');
replaceValue('GADDelayAppMeasurementInit', true, '<(?:true|false)\\s*/>');
replaceValue('SKAdNetworkItems', items, '<array>[\\s\\S]*?</array>');
const checked = plist.parse(xml);
if (checked.GADApplicationIdentifier !== config.appId) throw new Error('iOS App IDの同期検証に失敗しました。');
writeFileSync(path, xml);
console.log('iOS広告設定をInfo.plistへ同期・検証済み');
