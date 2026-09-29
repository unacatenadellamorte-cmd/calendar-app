import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    // mkdtempで作った専用ディレクトリだけを削除する。
    if (dirname(fixture) !== tmpdir() || !fixture.includes('calendar-admob-patch-')) throw new Error('不正なテスト用パス');
    rmSync(fixture, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'calendar-admob-patch-'));
  fixtures.push(root);
  const scriptRoot = join(root, 'scripts/android');
  mkdirSync(scriptRoot, { recursive: true });
  cpSync(resolve('scripts/android/patch-admob.mjs'), join(scriptRoot, 'patch-admob.mjs'));
  cpSync(resolve('scripts/android/admob-8.1.0'), join(scriptRoot, 'admob-8.1.0'), { recursive: true });
  const manifestPath = join(scriptRoot, 'admob-8.1.0/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    files: { path: string; replacement: string; sourceSha256: string }[];
  };
  const packageRoot = join(root, 'node_modules/@capacitor-community/admob');
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ version: '8.1.0' }));
  for (const entry of manifest.files) {
    const target = join(packageRoot, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    // 元ソースのハッシュ一致を制御できる独立したfixtureにする。
    const original = `元のJavaソース: ${entry.path}`;
    entry.sourceSha256 = createHash('sha256').update(original).digest('hex');
    writeFileSync(target, original);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { root, scriptRoot, packageRoot, manifest, script: join(scriptRoot, 'patch-admob.mjs') };
}

describe('AdMob 8.1.0の再現可能パッチ', () => {
  it('初回は適用し、再実行では同じファイルを変更しない', () => {
    const f = fixture();
    expect(execFileSync(process.execPath, [f.script], { encoding: 'utf8' })).toContain('適用 2ファイル');
    expect(execFileSync(process.execPath, [f.script], { encoding: 'utf8' })).toContain('適用 0ファイル');
    for (const entry of f.manifest.files) {
      expect(readFileSync(join(f.packageRoot, entry.path))).toEqual(readFileSync(join(f.scriptRoot, 'admob-8.1.0', entry.replacement)));
    }
  });
  it('依存バージョンが違うなら明確に失敗する', () => {
    const f = fixture();
    writeFileSync(join(f.packageRoot, 'package.json'), JSON.stringify({ version: '8.2.0' }));
    const result = spawnSync(process.execPath, [f.script], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AdMobパッチ対象は8.1.0のみ');
  });
  it('元ソース不一致では部分適用もせず失敗する', () => {
    const f = fixture();
    const untouched = join(f.packageRoot, f.manifest.files[0]!.path);
    const before = readFileSync(untouched);
    writeFileSync(join(f.packageRoot, f.manifest.files[1]!.path), '不明なソース変更');
    const result = spawnSync(process.execPath, [f.script], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AdMob元ソースのSHA不一致');
    expect(readFileSync(untouched)).toEqual(before);
  });
});
