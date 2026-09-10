import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from './env';
import { createSupabaseClient } from './supabase';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSupabaseClient', () => {
  it('環境変数が揃っていないときは null を返し、警告を1行出す(クラッシュしない)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missing: AppEnv = {
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      hasSupabase: false,
      googleOauthClientId: undefined,
      hasGoogleOauth: false,
    };

    const client = createSupabaseClient(missing);

    expect(client).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('VITE_SUPABASE_URL');
  });

  it('環境変数が揃っているときはクライアントを返す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const present: AppEnv = {
      supabaseUrl: 'http://localhost:54321',
      supabaseAnonKey: 'anon-key-for-tests',
      hasSupabase: true,
      googleOauthClientId: undefined,
      hasGoogleOauth: false,
    };

    const client = createSupabaseClient(present);

    expect(client).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
