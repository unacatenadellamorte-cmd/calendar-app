import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const patchRoot = resolve(root, 'scripts/android/admob-8.1.0');
const packageRoot = resolve(root, 'node_modules/@capacitor-community/admob');
const manifest = JSON.parse(readFileSync(resolve(patchRoot, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');
if (pkg.version !== manifest.version) throw new Error(`AdMobパッチ対象は${manifest.version}のみ（実際: ${pkg.version}）`);
// 全ファイルを先に検査する。不一致なら一部だけ書き換えず明確に失敗する。
const writes = manifest.files.map((entry) => {
  const target = resolve(packageRoot, entry.path);
  const current = sha(readFileSync(target));
  const replacement = readFileSync(resolve(patchRoot, entry.replacement));
  if (sha(replacement) !== entry.patchedSha256) throw new Error(`パッチ自体のSHA不一致: ${entry.replacement}`);
  if (current !== entry.sourceSha256 && current !== entry.patchedSha256) {
    throw new Error(`AdMob元ソースのSHA不一致: ${entry.path}。依存更新時はパッチの再検証が必要。`);
  }
  return { target, replacement, needed: current !== entry.patchedSha256 };
});
for (const { target, replacement, needed } of writes) if (needed) writeFileSync(target, replacement);
console.log(`AdMob ${manifest.version} カレンダー枠パッチ確認済み（適用 ${writes.filter((item) => item.needed).length}ファイル）`);
