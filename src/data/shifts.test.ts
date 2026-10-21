import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShiftTemplate } from './shift-templates';

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
const calls: { method: string; args: unknown[] }[] = [];
let rowsForIds: string[] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === 'upsert') rowsForIds = ((args[0] as { id: string }[]) ?? []).map((row) => row.id);
      return chain;
    };
  for (const m of ['select', 'insert', 'upsert', 'update', 'eq', 'is', 'order', 'in']) chain[m] = record(m);
  chain.then = (resolve: (v: unknown) => unknown) => resolve({
    ...queryResult,
    data: queryResult.error ? queryResult.data : rowsForIds.length
      ? rowsForIds.map((id, index) => ({
          ...((queryResult.data as Record<string, unknown>[] | null)?.[index] ?? eventRow()),
          id,
        }))
      : queryResult.data,
  });
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
  allDay: false,
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
  rowsForIds = [];
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
  it('同じフォームの再送は事前発番したIDを使い、衝突を無視する', async () => {
    queryResult = { data: [eventRow({ id: 'op-1' })], error: null };
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, ['2026-09-08'], ['op-1']);
    expect(r.ok).toBe(true);
    expect(calls.find((call) => call.method === 'upsert')?.args[0]).toEqual([
      expect.objectContaining({ id: 'op-1' }),
    ]);
    expect(calls.find((call) => call.method === 'upsert')?.args[1]).toMatchObject({
      onConflict: 'id',
      ignoreDuplicates: true,
    });
  });
  it('ID衝突時は既存行の編集・秘密・通知属性をそのまま返す', async () => {
    queryResult = { data: [eventRow({ id: 'op-1', title: '後から編集', is_secret: true, reminder_minutes: 15 })], error: null };
    const { createShifts } = await load();
    const result = await createShifts('shift', tpl, ['2026-09-08'], ['op-1']);
    expect(result.ok && result.value[0]).toMatchObject({ title: '後から編集', isSecret: true, reminderMinutes: 15 });
  });
  it('操作IDの件数不足や重複を拒否する', async () => {
    const { createShifts } = await load();
    expect((await createShifts('shift', tpl, ['2026-09-08', '2026-09-09'], ['one'])).ok).toBe(false);
    expect((await createShifts('shift', tpl, ['2026-09-08', '2026-09-09'], ['same', 'same'])).ok).toBe(false);
    expect(calls.some((call) => call.method === 'upsert')).toBe(false);
  });
  it('シフト色を保存し、作成直後・キャッシュ・再取得でもラベル色として保持する', async () => {
    const color = '#06B6D4';
    queryResult = { data: [eventRow({ label_color: color })], error: null };
    const { createShifts } = await load();
    const result = await createShifts('shift', { ...tpl, color }, ['2026-09-08']);
    expect(result.ok && result.value[0]?.labelColor).toBe(color);
    expect(calls.find((call) => call.method === 'upsert')?.args[0]).toEqual([
      expect.objectContaining({ label_color: color }),
    ]);
    expect(
      (calls.filter((call) => call.method === 'select').at(-1)?.args[0] as string).split(','),
    ).toContain('label_color');
    const { cacheGetAll } = await import('./cache');
    expect((await cacheGetAll('events')).find((event) => event.id === (calls.find((c) => c.method === 'upsert')?.args[0] as { id: string }[])[0]?.id)?.labelColor).toBe(
      color,
    );
    const { listEvents } = await import('./events');
    const reloaded = await listEvents();
    expect(reloaded.ok && reloaded.value[0]?.labelColor).toBe(color);
    const reloadSelect = calls.filter((call) => call.method === 'select').at(-1);
    expect((reloadSelect?.args[0] as string).split(',')).toContain('label_color');
  });
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
    const insertCall = calls.find((c) => c.method === 'upsert');
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
    const insertCall = calls.find((c) => c.method === 'upsert');
    expect((insertCall?.args[0] as unknown[]).length).toBe(3);
  });

  it('dates が空なら insert せず空配列', async () => {
    const { createShifts } = await load();
    const r = await createShifts('shift', tpl, []);
    expect(r.ok && r.value).toEqual([]);
    expect(calls.find((c) => c.method === 'upsert')).toBeUndefined();
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

it('終日シフトを月末の各選択日へ登録し、時刻・給料を持ち越さない', async () => {
  const dates = ['2026-09-30', '2026-10-01'];
  queryResult = {
    data: dates.map((date, i) =>
      eventRow({
        id: `holiday-${i}`,
        all_day: true,
        starts_at: null,
        ends_at: null,
        event_date: date,
        break_minutes: 0,
        hourly_wage: 0,
        label_color: tpl.color,
      }),
    ),
    error: null,
  };
  const { createShifts } = await load();
  const created = await createShifts(
    'shift',
    { ...tpl, allDay: true, startLocal: '', endLocal: '' },
    dates,
  );
  expect(calls.find((c) => c.method === 'upsert')?.args[0]).toEqual(
    dates.map((date) =>
      expect.objectContaining({
        all_day: true,
        event_date: date,
        starts_at: null,
        ends_at: null,
        break_minutes: 0,
        hourly_wage: 0,
        shift_template_id: tpl.id,
        label_color: tpl.color,
        workplace_label: tpl.workplaceLabel,
        source: 'local',
      }),
    ),
  );
  expect(
    created.ok && created.value.map((e) => [e.allDay, e.eventDate, e.startsAt, e.endsAt]),
  ).toEqual(dates.map((date) => [true, date, null, null]));
  const { cacheGetAll } = await import('./cache');
  const expectedIds = (calls.find((c) => c.method === 'upsert')?.args[0] as { id: string }[]).map((row) => row.id);
  const cached = (await cacheGetAll('events')).filter((e) => expectedIds.includes(e.id));
  expect(cached).toHaveLength(2);
  dates.forEach((date, index) => {
    expect(cached.find((e) => e.id === expectedIds[index])).toMatchObject({
      allDay: true,
      eventDate: date,
      startsAt: null,
      endsAt: null,
    });
  });
});
