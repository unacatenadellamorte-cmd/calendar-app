import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `supabase/functions/_shared/revenuecat-webhook.ts` は
 * `packages/core/src/revenuecat-webhook.ts` から生成される。ドリフトすると、
 * Edge の実挙動がテスト済みの純ロジックとずれる(google-events と同じ方式)。
 * ずれていたら `node scripts/sync-edge-shared.mjs` を実行して両方コミットする。
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const script = join(repoRoot, 'scripts', 'sync-edge-shared.mjs');

describe('edge shared: revenuecat-webhook', () => {
  it('supabase/functions/_shared/revenuecat-webhook.ts は packages/core から生成された最新版と一致する', () => {
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
