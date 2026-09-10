import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `supabase/functions/_shared/google-events.ts` は
 * `packages/core/src/google-events.ts` から生成される(Edge Function が
 * import できる場所に置くため)。この2つがドリフトすると、Google 予定の
 * 正規化がフロントの想定と Edge の実挙動でずれる ── Epic 3 retro F1。
 *
 * 生成スクリプトの --check モードで一致を検証する。ずれていたら
 * `node scripts/sync-edge-shared.mjs` を実行して両方コミットする。
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const script = join(repoRoot, 'scripts', 'sync-edge-shared.mjs');

describe('edge shared: google-events', () => {
  it('supabase/functions/_shared/google-events.ts は packages/core から生成された最新版と一致する', () => {
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
