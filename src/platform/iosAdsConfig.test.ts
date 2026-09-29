import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];
const plist = createRequire(import.meta.url)('plist') as {
  parse: (xml: string) => Record<string, unknown>;
  build: (value: Record<string, unknown>) => string;
};
afterEach(() => {
  for (const path of fixtures.splice(0)) {
    if (dirname(path) !== tmpdir() || !path.includes('calendar-ios-ads-')) throw new Error('不正な検証パス');
    rmSync(path, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'calendar-ios-ads-'));
  fixtures.push(root);
  for (const path of ['dist', 'ios/App/App/public', 'scripts/ios']) mkdirSync(join(root, path), { recursive: true });
  const config = { platform: 'ios', mode: 'test', appId: 'ca-app-pub-3940256099942544~1458002511', bannerId: 'ca-app-pub-3940256099942544/2435281174' };
  const configPath = join(root, 'dist/admob-config.json');
  const copiedPath = join(root, 'ios/App/App/public/admob-config.json');
  writeFileSync(configPath, JSON.stringify(config));
  writeFileSync(copiedPath, JSON.stringify(config));
  cpSync(resolve('scripts/ios/skadnetwork-ids.json'), join(root, 'scripts/ios/skadnetwork-ids.json'));
  const plistPath = join(root, 'ios/App/App/Info.plist');
  writeFileSync(plistPath, '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><!--既存コメント--><key>CFBundleName</key><string>Multi calendar</string></dict></plist>');
  const run = (env: Record<string, string> = {}) => spawnSync(process.execPath, [resolve('scripts/ios/sync-admob-config.mjs'), root], {
    encoding: 'utf8', env: { ...process.env, CAPACITOR_PLATFORM_NAME: 'ios', ...env },
  });
  return { config, configPath, copiedPath, plistPath, run };
}

describe('iOS広告のネイティブ設定同期', () => {
  it('IDとSKAdNetworkを追加し、既存項目を保ち、再実行も同一になる', () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    const once = readFileSync(f.plistPath, 'utf8');
    expect(once).toContain(f.config.appId);
    expect(once).toContain('cstr6suwn9.skadnetwork');
    expect(once).toContain('GADDelayAppMeasurementInit');
    expect(once).toContain('<!--既存コメント-->');
    expect(once).toContain('Multi calendar');
    expect(f.run().status).toBe(0);
    expect(readFileSync(f.plistPath, 'utf8')).toBe(once);
    expect(once).not.toContain('NSUserTrackingUsageDescription');
  });
  it('Android用ビルドをiOSへ同期しようとしたらplistを変えず失敗する', () => {
    const f = fixture();
    const before = readFileSync(f.plistPath, 'utf8');
    writeFileSync(f.configPath, JSON.stringify({ ...f.config, platform: 'android' }));
    expect(f.run().stderr).toContain('VITE_ADMOB_PLATFORM=ios');
    expect(readFileSync(f.plistPath, 'utf8')).toBe(before);
  });
  it('既存の広告値を更新し、独自キーとSKAdNetworkを保持して重複を増やさない', () => {
    const f = fixture();
    const custom = { nested: ['保持する値', 3], enabled: false };
    writeFileSync(f.plistPath, plist.build({
      CFBundleName: '既存のアプリ', CustomSettings: custom,
      GADApplicationIdentifier: 'ca-app-pub-1234567890123456~1234567890', GADDelayAppMeasurementInit: false,
      SKAdNetworkItems: [{ SKAdNetworkIdentifier: 'existing01.skadnetwork' }, { SKAdNetworkIdentifier: 'cstr6suwn9.skadnetwork' }],
    }));
    expect(f.run().status).toBe(0);
    const once = plist.parse(readFileSync(f.plistPath, 'utf8'));
    expect(once).toMatchObject({ CFBundleName: '既存のアプリ', CustomSettings: custom,
      GADApplicationIdentifier: f.config.appId, GADDelayAppMeasurementInit: true });
    const ids = (once.SKAdNetworkItems as { SKAdNetworkIdentifier: string }[]).map((item) => item.SKAdNetworkIdentifier);
    expect(ids).toContain('existing01.skadnetwork');
    expect(ids).toContain('cstr6suwn9.skadnetwork');
    expect(new Set(ids).size).toBe(ids.length);
    expect(f.run().status).toBe(0);
    expect(plist.parse(readFileSync(f.plistPath, 'utf8'))).toEqual(once);
  });
  it('自分のUMP App IDをテストバナーと組み合わせて同期できる', () => {
    const f = fixture();
    const custom = { ...f.config, appId: 'ca-app-pub-1234567890123456~9876543210' };
    writeFileSync(f.configPath, JSON.stringify(custom));
    writeFileSync(f.copiedPath, JSON.stringify(custom));
    expect(f.run().status).toBe(0);
    expect(plist.parse(readFileSync(f.plistPath, 'utf8')).GADApplicationIdentifier).toBe(custom.appId);
    expect(f.run({ ADMOB_ANDROID_APP_ID: custom.appId }).stderr).toContain('流用');
    const invalid = { ...custom, bannerId: 'ca-app-pub-1234567890123456/9876543210' };
    writeFileSync(f.configPath, JSON.stringify(invalid));
    writeFileSync(f.copiedPath, JSON.stringify(invalid));
    expect(f.run().stderr).toContain('公式iOSテストバナーID');
  });
  it('コピー済み設定の不一致とiOS検証IDの流用を拒否する', () => {
    const f = fixture();
    writeFileSync(f.copiedPath, JSON.stringify({ ...f.config, mode: 'production' }));
    expect(f.run().stderr).toContain('一致しません');
    const wrong = { ...f.config, appId: 'ca-app-pub-3940256099942544~3347511713' };
    writeFileSync(f.configPath, JSON.stringify(wrong));
    writeFileSync(f.copiedPath, JSON.stringify(wrong));
    expect(f.run().stderr).toContain('流用');
  });
});
