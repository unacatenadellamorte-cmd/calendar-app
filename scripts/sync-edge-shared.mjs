// packages/core の純ロジックを、Deno の Edge Function が import できる
// supabase/functions/_shared/ へ「生成」してコピーする。
//
//   node scripts/sync-edge-shared.mjs          … 生成(デプロイ前に実行)
//   node scripts/sync-edge-shared.mjs --check  … 差分があれば非ゼロ終了(テスト/CI 用)
//
// なぜコピーか: Supabase の Edge Function バンドラは supabase/functions/ の外
// (packages/core)を確実には辿らない。_shared/ は標準の共有場所なので、
// 一次ソース(packages/core)から生成してここに置く。一致は
// packages/core/src/google-events.parity.test.ts が保証する。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ src: string; dest: string }[]} */
const targets = [
  {
    src: 'packages/core/src/google-events.ts',
    dest: 'supabase/functions/_shared/google-events.ts',
  },
];

const HEADER =
  '// === 生成ファイル。手で編集しない。 ===\n' +
  '// 一次ソース: {src}\n' +
  '// 再生成: node scripts/sync-edge-shared.mjs\n' +
  '// 一致の保証: packages/core/src/google-events.parity.test.ts\n\n';

/** 一次ソースから生成後の中身を作る。 */
function render(srcRel) {
  const body = readFileSync(join(root, srcRel), 'utf8');
  return HEADER.replace('{src}', srcRel) + body;
}

const check = process.argv.includes('--check');
let drifted = false;

for (const { src, dest } of targets) {
  const want = render(src);
  const destPath = join(root, dest);
  const have = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null;
  if (have === want) continue;

  if (check) {
    drifted = true;
    console.error(`drift: ${dest} が ${src} と一致しません`);
  } else {
    writeFileSync(destPath, want);
    console.log(`wrote ${dest}`);
  }
}

if (check && drifted) {
  console.error('→ node scripts/sync-edge-shared.mjs を実行して両方コミットしてください');
  process.exit(1);
}
if (check) console.log('edge shared: 一致');
