import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('実Postgresエンジンで予定反映の権利・排他・削除競合を検証する', () => {
  const output = execFileSync(process.execPath, ['scripts/test-google-push-db.mjs'], { encoding: 'utf8', timeout: 30000 });
  expect(output).toContain('SQL検証成功');
}, 35000);
