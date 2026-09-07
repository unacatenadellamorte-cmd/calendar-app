import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * supabase のクエリビルダをモックして calendars.ts を検証する。
 * Docker 未導入で Supabase ローカルが起動できないため、結合テストの代わり。
 */

/** 直近のクエリの結果と、記録された呼び出し。 */
let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
const calls: { method: string; args: unknown[] }[] = [];

/** select/insert/update/... のあらゆる連鎖を受けて、最後に await されると queryResult を返す。 */
function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'is',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    chain[m] = record(m);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
  return chain;
}

const from = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }));
const rpc = vi.fn(async () => queryResult);

let supabaseValue: unknown = { from, auth: { getUser }, rpc };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

async function importCalendars() {
  return import('./calendars');
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'テスト',
  color: '#0072B2',
  source: 'local',
  is_shift: false,
  is_visible: true,
  priority: 0,
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  queryResult = { data: null, error: null };
  supabaseValue = { from, auth: { getUser }, rpc };
  from.mockReset();
  from.mockImplementation(() => makeChain());
  getUser.mockClear();
  rpc.mockClear();
});

describe('calendars.ts', () => {
  it('listCalendars: 行を camelCase に変換して返す', async () => {
    queryResult = { data: [row(), row({ id: 'c2', is_shift: true })], error: null };
    const { listCalendars } = await importCalendars();
    const r = await listCalendars();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toMatchObject({ id: 'c1', isShift: false, isVisible: true, priority: 0 });
      expect(r.value[1]).toMatchObject({ id: 'c2', isShift: true });
    }
    expect(calls.map((c) => c.method)).toContain('is'); // deleted_at is null で絞る
    // priority 昇順で取得(Story 2.1)
    expect(calls.find((c) => c.method === 'order')?.args).toEqual([
      'priority',
      { ascending: true },
    ]);
  });

  it('createCalendar: source=local で insert し、camelCase を返す', async () => {
    queryResult = { data: row({ name: '仕事' }), error: null };
    const { createCalendar } = await importCalendars();
    const r = await createCalendar({ name: '  仕事  ', color: '#0072B2' });
    expect(r.ok).toBe(true);
    const insert = calls.find((c) => c.method === 'insert');
    // user_id は DB の default auth.uid() が入れるので insert には含めない
    expect(insert?.args[0]).toEqual({ name: '仕事', color: '#0072B2', source: 'local' });
  });

  it('renameCalendar: trim して update する', async () => {
    queryResult = { data: row({ name: '個人' }), error: null };
    const { renameCalendar } = await importCalendars();
    const r = await renameCalendar('c1', '  個人  ');
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: '個人' });
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'c1']);
  });

  it('recolorCalendar: プリセット外の色を拒否、プリセット色は update', async () => {
    const { recolorCalendar } = await importCalendars();
    expect((await recolorCalendar('c1', '#abcdef')).ok).toBe(false);
    queryResult = { data: row({ color: '#009E73' }), error: null };
    const r = await recolorCalendar('c1', '#009E73');
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ color: '#009E73' });
  });

  it('setCalendarVisible: is_visible を update する', async () => {
    queryResult = { data: row({ is_visible: false }), error: null };
    const { setCalendarVisible } = await importCalendars();
    const r = await setCalendarVisible('c1', false);
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ is_visible: false });
  });

  it('createCalendar: 空名を拒否する', async () => {
    const { createCalendar } = await importCalendars();
    const r = await createCalendar({ name: '   ', color: '#0072B2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('calendar/invalid-name');
    expect(from).not.toHaveBeenCalled();
  });

  it('createCalendar: プリセット外の色を拒否する', async () => {
    const { createCalendar } = await importCalendars();
    const r = await createCalendar({ name: '仕事', color: '#123456' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('calendar/invalid-color');
  });

  it('deleteCalendar: シフト用カレンダーを拒否する', async () => {
    const { deleteCalendar } = await importCalendars();
    const r = await deleteCalendar({ id: 'shift-1', isShift: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('calendar/shift-undeletable');
    expect(from).not.toHaveBeenCalled();
  });

  it('deleteCalendar: 通常カレンダーは deleted_at を立てる', async () => {
    queryResult = { data: null, error: null };
    const { deleteCalendar } = await importCalendars();
    const r = await deleteCalendar({ id: 'c1', isShift: false });
    expect(r.ok).toBe(true);
    const update = calls.find((c) => c.method === 'update');
    expect(update?.args[0]).toHaveProperty('deleted_at');
  });

  it('ensureShiftCalendar: 既存があればそれを返す(insert しない)', async () => {
    queryResult = {
      data: row({ id: 'shift-1', is_shift: true, name: 'シフト' }),
      error: null,
    };
    const { ensureShiftCalendar } = await importCalendars();
    const r = await ensureShiftCalendar();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isShift).toBe(true);
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('ensureShiftCalendar: 無ければ is_shift=true で作る', async () => {
    // maybeSingle は null(存在しない)、その後 ins は成功
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      const chain = makeChain();
      // 1回目(select .maybeSingle)は null、2回目(insert)は行を返す
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          call === 1
            ? { data: null, error: null }
            : { data: row({ is_shift: true }), error: null },
        );
      return chain;
    });
    const { ensureShiftCalendar } = await importCalendars();
    const r = await ensureShiftCalendar();
    expect(r.ok).toBe(true);
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({
      name: 'シフト',
      color: '#009E73',
      source: 'local',
      is_shift: true,
    });
  });

  it('Supabase 未設定なら unavailable を返し、supabase に触れない', async () => {
    supabaseValue = null;
    const { listCalendars, createCalendar } = await importCalendars();
    expect((await listCalendars()).ok).toBe(false);
    const r = await createCalendar({ name: '仕事', color: '#0072B2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/unavailable');
  });

  it('Postgrest エラーを AppError に正規化する', async () => {
    queryResult = { data: null, error: { message: 'boom', code: '42501' } };
    const { listCalendars } = await importCalendars();
    const r = await listCalendars();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/query');
  });

  it('reorderCalendars: RPC reorder_calendars を ordered_ids で呼び、最新一覧を返す', async () => {
    queryResult = {
      data: [row({ id: 'b', priority: 0 }), row({ id: 'a', priority: 1 })],
      error: null,
    };
    const { reorderCalendars } = await importCalendars();
    const r = await reorderCalendars(['b', 'a']);
    expect(rpc).toHaveBeenCalledWith('reorder_calendars', { ordered_ids: ['b', 'a'] });
    expect(r.ok && r.value.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('reorderCalendars: RPC エラーは data/query', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'P0001' } });
    const { reorderCalendars } = await importCalendars();
    const r = await reorderCalendars(['a', 'b']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/query');
  });
});

describe('calendars.ts — オフライン(Story 1.6)', () => {
  beforeEach(() => vi.stubGlobal('navigator', { onLine: false }));
  afterEach(() => vi.unstubAllGlobals());

  it('listCalendars はオフラインでキャッシュを返す(supabase に触れない)', async () => {
    const { cachePut } = await import('./cache');
    await cachePut('calendars', {
      id: 'c1', name: 'キャッシュ', color: '#2563EB', source: 'local',
      isShift: false, isVisible: true, priority: 0, createdAt: '', updatedAt: '',
    });
    const { listCalendars } = await importCalendars();
    const r = await listCalendars();
    expect(r.ok && r.value.map((c) => c.name)).toEqual(['キャッシュ']);
    expect(from).not.toHaveBeenCalled();
  });

  it('createCalendar はオフラインで outbox に積み、楽観行を返す', async () => {
    const { createCalendar } = await importCalendars();
    const { listOutbox } = await import('./outbox');
    const r = await createCalendar({ name: '部活', color: '#009E73' });
    expect(r.ok).toBe(true);
    expect(from).not.toHaveBeenCalled();
    expect((await listOutbox())[0]).toMatchObject({ entity: 'calendar', op: 'create' });
  });

  it('renameCalendar はオフラインで outbox に rename を積む', async () => {
    const { cachePut } = await import('./cache');
    await cachePut('calendars', {
      id: 'c1', name: '旧', color: '#2563EB', source: 'local',
      isShift: false, isVisible: true, priority: 0, createdAt: '', updatedAt: '',
    });
    const { renameCalendar } = await importCalendars();
    const { listOutbox } = await import('./outbox');
    const r = await renameCalendar('c1', '新');
    expect(r.ok && r.value.name).toBe('新');
    expect((await listOutbox())[0]).toMatchObject({ op: 'rename', targetId: 'c1' });
    expect(from).not.toHaveBeenCalled();
  });
});
