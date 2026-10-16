// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('ローカル認証はアプリが必要とする匿名サインインを許可する', () => {
  expect(readFileSync('supabase/config.toml', 'utf8')).toMatch(
    /^enable_anonymous_sign_ins = true$/m,
  );
});
