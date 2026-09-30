import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * supabase のクエリビルダをモックして shift-templates.ts を検証する
 * (Docker 未導入で Supabase ローカルが起動できないため)。
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
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'order', 'single']) {
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

async function load() {
  return import('./shift-templates');
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: '平日',
  all_day: false,
  start_local: '17:00',
  end_local: '22:00',
  break_minutes: 30,
  hourly_wage: 1100,
  workplace_label: null,
  color: '#009E73',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  name: '平日',
  startLocal: '17:00',
  endLocal: '22:00',
  breakMinutes: 30,
  hourlyWage: 1100,
  workplaceLabel: null,
  color: '#009E73',
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

describe('templateWorkedMinutes', () => {
  it('通常は end - start', async () => {
    const { templateWorkedMinutes } = await load();
    expect(templateWorkedMinutes('17:00', '22:00')).toBe(300);
  });
  it('日またぎは通算する', async () => {
    const { templateWorkedMinutes } = await load();
    expect(templateWorkedMinutes('22:00', '06:00')).toBe(480);
  });
  it('start == end は null', async () => {
    const { templateWorkedMinutes } = await load();
    expect(templateWorkedMinutes('09:00', '09:00')).toBeNull();
  });
  it('形が不正なら null', async () => {
    const { templateWorkedMinutes } = await load();
    expect(templateWorkedMinutes('9:00', '18:00')).toBeNull();
  });
});

describe('createShiftTemplate バリデーション', () => {
  it('24色のプリセットを全てシフトの色として保存できる', async () => {
    const { CALENDAR_COLORS } = await import('./calendar-colors');
    const { createShiftTemplate } = await load();
    expect(CALENDAR_COLORS).toHaveLength(24);
    for (const { hex } of CALENDAR_COLORS) {
      queryResult = { data: row({ color: hex }), error: null };
      const result = await createShiftTemplate(input({ color: hex }));
      expect(result.ok && result.value.color).toBe(hex);
      const inserted = calls.filter((call) => call.method === 'insert').at(-1)?.args[0];
      expect(inserted).toEqual(expect.objectContaining({ color: hex }));
    }
  });
  const cases: [string, Record<string, unknown>, string][] = [
    ['名前空', { name: '' }, 'shift-template/invalid-name'],
    ['時刻不正', { startLocal: '0900' }, 'shift-template/invalid-time'],
    ['開始=終了', { startLocal: '10:00', endLocal: '10:00' }, 'shift-template/invalid-time'],
    ['休憩が負', { breakMinutes: -5 }, 'shift-template/invalid-break'],
    [
      '休憩 >= 実働',
      { startLocal: '17:00', endLocal: '22:00', breakMinutes: 300 },
      'shift-template/invalid-break',
    ],
    ['時給が負', { hourlyWage: -1 }, 'shift-template/invalid-wage'],
    ['色がプリセット外', { color: '#123456' }, 'shift-template/invalid-color'],
  ];

  it.each(cases)('%s → %s で弾く', async (_label, over, key) => {
    const { createShiftTemplate } = await load();
    const r = await createShiftTemplate(input(over) as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe(key);
  });

  it('日またぎシフト(休憩 < 実働)は通る', async () => {
    queryResult = {
      data: row({ start_local: '22:00', end_local: '06:00', break_minutes: 60 }),
      error: null,
    };
    const { createShiftTemplate } = await load();
    const r = await createShiftTemplate(
      input({ startLocal: '22:00', endLocal: '06:00', breakMinutes: 60 }) as never,
    );
    expect(r.ok).toBe(true);
  });
});

describe('shift-templates.ts data 層', () => {
  it('listShiftTemplates: camelCase に変換、deleted_at で絞る', async () => {
    queryResult = { data: [row(), row({ id: 't2', workplace_label: 'カフェ' })], error: null };
    const { listShiftTemplates } = await load();
    const r = await listShiftTemplates();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toMatchObject({
        id: 't1',
        startLocal: '17:00',
        breakMinutes: 30,
        workplaceLabel: null,
      });
      expect(r.value[1]).toMatchObject({ id: 't2', workplaceLabel: 'カフェ' });
    }
    expect(calls.map((c) => c.method)).toContain('is');
  });

  it('createShiftTemplate: 正常時は行を返す', async () => {
    queryResult = { data: row(), error: null };
    const { createShiftTemplate } = await load();
    const r = await createShiftTemplate(input() as never);
    expect(r.ok && r.value.id).toBe('t1');
    expect(calls.map((c) => c.method)).toContain('insert');
  });

  it('updateShiftTemplate: patch のフィールドだけ送る', async () => {
    queryResult = { data: row({ name: '早番' }), error: null };
    const { updateShiftTemplate } = await load();
    const current = {
      allDay: false,
      id: 't1',
      name: '平日',
      startLocal: '17:00',
      endLocal: '22:00',
      breakMinutes: 30,
      hourlyWage: 1100,
      workplaceLabel: null,
      color: '#009E73',
      createdAt: '',
      updatedAt: '',
    };
    const r = await updateShiftTemplate(current, { name: '早番' });
    expect(r.ok && r.value.name).toBe('早番');
    const updateCall = calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ name: '早番' });
  });

  it('deleteShiftTemplate: deleted_at を立てる', async () => {
    queryResult = { data: null, error: null };
    const { deleteShiftTemplate } = await load();
    const r = await deleteShiftTemplate('t1');
    expect(r.ok).toBe(true);
    const call = calls.find((c) => c.method === 'update');
    expect(call?.args[0]).toHaveProperty('deleted_at');
  });

  it('supabase 未設定なら data/unavailable', async () => {
    supabaseValue = null;
    const { listShiftTemplates } = await load();
    const r = await listShiftTemplates();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/unavailable');
  });

  it('PostgREST エラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'boom', code: '42501' } };
    const { listShiftTemplates } = await load();
    const r = await listShiftTemplates();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });
});

it('終日の作成・一覧・編集でフラグを保持し、非表示の不正値を正規化する', async () => {
  const { createShiftTemplate, listShiftTemplates, updateShiftTemplate } = await load();
  queryResult = {
    data: row({
      all_day: true,
      start_local: '09:00',
      end_local: '18:00',
      break_minutes: 0,
      hourly_wage: 0,
    }),
    error: null,
  };
  const created = await createShiftTemplate(
    input({ allDay: true, startLocal: '', endLocal: '', breakMinutes: -1, hourlyWage: NaN }),
  );
  expect(created.ok && created.value.allDay).toBe(true);
  expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
    all_day: true,
    start_local: '09:00',
    end_local: '18:00',
    break_minutes: 0,
    hourly_wage: 0,
  });
  queryResult = { data: [row({ all_day: true }), row()], error: null };
  const listed = await listShiftTemplates();
  expect(listed.ok && listed.value.map((t) => t.allDay)).toEqual([true, false]);
  if (!listed.ok) throw new Error('一覧取得失敗');
  queryResult = { data: row({ all_day: false }), error: null };
  await updateShiftTemplate(listed.value[0]!, { allDay: false });
  expect(calls.filter((c) => c.method === 'update').at(-1)?.args[0]).toEqual({
    all_day: false,
  });
  expect(
    calls
      .filter((c) => c.method === 'select')
      .every((c) => String(c.args[0]).split(',').includes('all_day')),
  ).toBe(true);
});

it('時刻付きから終日へ更新したpayloadを保存し、再取得でも時刻を維持して給料を除外する', async () => {
  // 固定レスポンスではなく、更新payloadを保存した行から応答を組み立てる。
  let stored: Record<string, unknown> = row();
  from.mockImplementation(() => {
    const chain = makeChain();
    let single = false;
    chain.update = (payload: Record<string, unknown>) => {
      calls.push({ method: 'update', args: [payload] });
      stored = { ...stored, ...payload };
      return chain;
    };
    chain.single = () => {
      single = true;
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: single ? { ...stored } : [{ ...stored }], error: null });
    return chain;
  });
  const { listShiftTemplates, updateShiftTemplate } = await load();
  const initial = await listShiftTemplates();
  expect(initial.ok && initial.value[0]?.allDay).toBe(false);
  if (!initial.ok) throw new Error('一覧取得失敗');
  const updated = await updateShiftTemplate(initial.value[0]!, { allDay: true });
  expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({
    all_day: true,
    start_local: '17:00',
    end_local: '22:00',
    break_minutes: 0,
    hourly_wage: 0,
  });
  const expected = {
    allDay: true,
    startLocal: '17:00',
    endLocal: '22:00',
    breakMinutes: 0,
    hourlyWage: 0,
  };
  expect(updated.ok && updated.value).toMatchObject(expected);
  const reloaded = await listShiftTemplates();
  expect(reloaded.ok && reloaded.value[0]).toMatchObject(expected);
});
