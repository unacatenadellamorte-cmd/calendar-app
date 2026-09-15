import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * supabase のクエリビルダをモックして profiles.ts を検証する(calendars.test.ts と同じ方式)。
 * Docker 未導入で Supabase ローカルが起動できないため、結合テストの代わり。
 */

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
const calls: { method: string; args: unknown[] }[] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of ['select', 'insert', 'update', 'single', 'maybeSingle']) {
    chain[m] = record(m);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
  return chain;
}

const from = vi.fn();
let supabaseValue: unknown = { from };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

async function importProfiles() {
  return import('./profiles');
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  display_name: 'テスト太郎',
  avatar_data_url: null,
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  queryResult = { data: null, error: null };
  supabaseValue = { from };
  from.mockReset();
  from.mockImplementation(() => makeChain());
});

describe('profiles.ts', () => {
  it('getProfile: 行があれば camelCase に変換して返す', async () => {
    queryResult = { data: row(), error: null };
    const { getProfile } = await importProfiles();
    const r = await getProfile();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ id: 'u1', displayName: 'テスト太郎', avatarDataUrl: null });
    }
    expect(calls.some((c) => c.method === 'maybeSingle')).toBe(true);
  });

  it('getProfile: 行が無ければエラーではなく null を返す', async () => {
    queryResult = { data: null, error: null };
    const { getProfile } = await importProfiles();
    const r = await getProfile();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('createProfile: 名前を trim して insert する(写真無し)', async () => {
    queryResult = { data: row({ display_name: '花子' }), error: null };
    const { createProfile } = await importProfiles();
    const r = await createProfile({ displayName: '  花子  ' });
    expect(r.ok).toBe(true);
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({ display_name: '花子', avatar_data_url: null });
  });

  it('createProfile: 写真ありなら avatar_data_url も insert する', async () => {
    const dataUrl = 'data:image/jpeg;base64,xxx';
    queryResult = { data: row({ avatar_data_url: dataUrl }), error: null };
    const { createProfile } = await importProfiles();
    const r = await createProfile({ displayName: '花子', avatarDataUrl: dataUrl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.avatarDataUrl).toBe(dataUrl);
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({ display_name: '花子', avatar_data_url: dataUrl });
  });

  it('createProfile: 名前が空なら拒否し、supabase に触れない', async () => {
    const { createProfile } = await importProfiles();
    const r = await createProfile({ displayName: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('profile/invalid-name');
    expect(from).not.toHaveBeenCalled();
  });

  it('createProfile: 51文字以上の名前は拒否する', async () => {
    const { createProfile } = await importProfiles();
    const r = await createProfile({ displayName: 'あ'.repeat(51) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('profile/invalid-name');
  });

  it('createProfile: 主キー重複(23505、同時作成)なら getProfile にフォールバックして成功扱いにする', async () => {
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      const chain = makeChain();
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          call === 1
            ? { data: null, error: { message: 'duplicate key value', code: '23505' } }
            : { data: row({ display_name: '花子' }), error: null },
        );
      return chain;
    });
    const { createProfile } = await importProfiles();
    const r = await createProfile({ displayName: '花子' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.displayName).toBe('花子');
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('createProfile: 23505 でも getProfile 側が失敗したら元のエラーを返す', async () => {
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      const chain = makeChain();
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          call === 1
            ? { data: null, error: { message: 'duplicate key value', code: '23505' } }
            : { data: null, error: { message: 'still broken', code: '500' } },
        );
      return chain;
    });
    const { createProfile } = await importProfiles();
    const r = await createProfile({ displayName: '花子' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/query');
  });

  it('updateProfile: 渡したフィールドだけ update する', async () => {
    queryResult = { data: row({ display_name: '次郎' }), error: null };
    const { updateProfile } = await importProfiles();
    const r = await updateProfile({ displayName: '  次郎  ' });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ display_name: '次郎' });
  });

  it('updateProfile: 空名は拒否する', async () => {
    const { updateProfile } = await importProfiles();
    const r = await updateProfile({ displayName: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('profile/invalid-name');
    expect(from).not.toHaveBeenCalled();
  });

  it('Supabase 未設定なら unavailable を返し、supabase に触れない', async () => {
    supabaseValue = null;
    const { getProfile, createProfile } = await importProfiles();
    expect((await getProfile()).ok).toBe(false);
    const r = await createProfile({ displayName: '花子' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/unavailable');
  });

  it('Postgrest エラーを AppError に正規化する', async () => {
    queryResult = { data: null, error: { message: 'boom', code: '42501' } };
    const { getProfile } = await importProfiles();
    const r = await getProfile();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/query');
  });
});
