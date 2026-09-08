import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShiftTemplate } from './shift-templates';

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
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order']) chain[m] = record(m);
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
  return import('./shifts');
}

const tpl: ShiftTemplate = {
  id: 't1',
  name: '平日',
  startLocal: '17:00',
  endLocal: '22:00',
  breakMinutes: 30,
  hourlyWage: 1100,
  workplaceLabel: 'カフェ',
  color: '#009E73',
  createdAt: '',
  updatedAt: '',
};

const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'ev1',
  calendar_id: 'shift',
  title: '平日',
  all_day: false,
  starts_at: '2026-09-08T08:00:00Z',
  ends_at: '2026-09-08T13:00:00Z',
  event_date: null,
  note: null,
  source: 'local',
  break_minutes: 30,
  hourly_wage: 1100,
  workplace_label: 'カフェ',
  shift_template_id: 't1',
  created_at: '',
  updated_at: '',
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

describe('buildShiftTimes', () => {
  it('通常のシフトは同日の開始・終了', async () => {
    const { buildShiftTimes } = await load();
    const r = buildShiftTimes('2026-09-08', '17:00', '22:00');
    expect(r.startsAt).toBe(new Date('2026-09-08T17:00').toISOString());
    expect(r.endsAt).toBe(new Date('2026-09-08T22:00').toISOString());
    expect(Date.parse(r.startsAt)).toBeLessThan(Date.parse(r.endsAt));
  });

  it('endLocal <= startLocal なら終了は翌日', async () => {
    const { buildShiftTimes } = await load();
    const r = buildShiftTimes('2026-09-08', '22:00', '06:00');
    expect(r.startsAt).toBe(new Date('2026-09-08T22:00').toISOString());
    expect(r.endsAt).toBe(new Date('2026-09-09T06:00').toISOString());
    expect(Date.parse(r.startsAt)).toBeLessThan(Date.parse(r.endsAt));
  });
});

describe('createShifts', () => {
  it('1日ぶんを insert し、シフト属性つきの EventItem を返す', async () => {
    queryResult = { data: [eventRow()], error: null };
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, ['2026-09-08']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toMatchObject({
        calendarId: 'shift',
        breakMinutes: 30,
        hourlyWage: 1100,
        workplaceLabel: 'カフェ',
        shiftTemplateId: 't1',
      });
    }
    const insertCall = calls.find((c) => c.method === 'insert');
    expect(Array.isArray(insertCall?.args[0])).toBe(true);
    expect((insertCall?.args[0] as unknown[]).length).toBe(1);
  });

  it('複数日は日数ぶんの行を insert する', async () => {
    queryResult = {
      data: [eventRow({ id: 'a' }), eventRow({ id: 'b' }), eventRow({ id: 'c' })],
      error: null,
    };
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, ['2026-09-08', '2026-09-09', '2026-09-10']);
    expect(r.ok && r.value.length).toBe(3);
    const insertCall = calls.find((c) => c.method === 'insert');
    expect((insertCall?.args[0] as unknown[]).length).toBe(3);
  });

  it('dates が空なら insert せず空配列', async () => {
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, []);
    expect(r.ok && r.value).toEqual([]);
    expect(calls.find((c) => c.method === 'insert')).toBeUndefined();
  });

  it('PostgREST エラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'boom', code: '23514' } };
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, ['2026-09-08']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });

  it('supabase 未設定なら data/unavailable', async () => {
    supabaseValue = null;
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, ['2026-09-08']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/unavailable');
  });
});
