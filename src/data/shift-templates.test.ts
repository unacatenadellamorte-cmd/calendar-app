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
  const cases: [string, Record<string, unknown>, string][] = [
    ['名前空', { name: '' }, 'shift-template/invalid-name'],
    ['時刻不正', { startLocal: '0900' }, 'shift-template/invalid-time'],
    ['開始=終了', { startLocal: '10:00', endLocal: '10:00' }, 'shift-template/invalid-time'],
    ['休憩が負', { breakMinutes: -5 }, 'shift-template/invalid-break'],
    ['休憩 >= 実働', { startLocal: '17:00', endLocal: '22:00', breakMinutes: 300 }, 'shift-template/invalid-break'],
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
    queryResult = { data: row({ start_local: '22:00', end_local: '06:00', break_minutes: 60 }), error: null };
    const { createShiftTemplate } = await load();
    const r = await createShiftTemplate(input({ startLocal: '22:00', endLocal: '06:00', breakMinutes: 60 }) as never);
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
      expect(r.value[0]).toMatchObject({ id: 't1', startLocal: '17:00', breakMinutes: 30, workplaceLabel: null });
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
      id: 't1', name: '平日', startLocal: '17:00', endLocal: '22:00',
      breakMinutes: 30, hourlyWage: 1100, workplaceLabel: null, color: '#009E73',
      createdAt: '', updatedAt: '',
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
