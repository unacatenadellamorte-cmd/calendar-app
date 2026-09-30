import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeviceEnv } from './build-device-web.mjs';

const token = (role, ref = 'testproject') => `header.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.signature`;
const config = (key = token('anon')) => ({ VITE_SUPABASE_URL: 'https://testproject.supabase.co', VITE_SUPABASE_ANON_KEY: key });

test('CIの空設定は実機用成果物にできない', () => {
  assert.throws(() => validateDeviceEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }), /公開キーが必要/);
  assert.throws(() => validateDeviceEnv({ ...config(), VITE_SUPABASE_ANON_KEY: '' }), /公開キーが必要/);
});
test('管理者キーとプロジェクト違いを拒否する', () => {
  assert.throws(() => validateDeviceEnv(config(token('service_role'))), /公開用/);
  assert.throws(() => validateDeviceEnv(config('sb_secret_private')), /公開用/);
  assert.throws(() => validateDeviceEnv(config(token('anon', 'otherproject'))), /一致/);
});
test('資格情報付きURLとHTTPを拒否する', () => {
  for (const url of ['http://testproject.supabase.co', 'https://user:pass@testproject.supabase.co', 'https://testproject.supabase.co/?key=secret']) {
    assert.throws(() => validateDeviceEnv({ ...config(), VITE_SUPABASE_URL: url }), /HTTPS/);
  }
});
test('既存anonキーと新しい公開キーを利用できる', () => {
  assert.equal(validateDeviceEnv(config()).url, 'https://testproject.supabase.co');
  assert.equal(validateDeviceEnv(config('sb_publishable_example')).key, 'sb_publishable_example');
});
