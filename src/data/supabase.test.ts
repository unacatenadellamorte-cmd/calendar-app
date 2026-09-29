import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from './env';
import { accountAwareFetch, createSupabaseClient } from './supabase';
import { writeDeletion } from './account-deletion-state';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('削除中の通信遮断', () => {
  it('削除前に送った応答を削除後のキャッシュ処理へ返さない', async () => {
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = accountAwareFetch('https://example.invalid/rest/v1/events');
    writeDeletion({ userId: '本人', phase: 'remote' });
    complete(new Response('[]'));
    await expect(pending).rejects.toThrow('アカウントの削除中です');
    await expect(accountAwareFetch('https://example.invalid/functions/v1/sync-calendars')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('削除再試行とローカルサインアウトに必要な通信は通す', async () => {
    writeDeletion({ userId: '本人', phase: 'remote' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('null')));
    await expect(accountAwareFetch('https://example.invalid/rest/v1/rpc/delete_my_account')).resolves.toBeInstanceOf(Response);
    await expect(accountAwareFetch('https://example.invalid/auth/v1/logout')).resolves.toBeInstanceOf(Response);
  });
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
