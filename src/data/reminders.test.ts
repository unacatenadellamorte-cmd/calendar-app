import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveNotificationId } from '@core';

/**
 * reminders.ts の検証。supabase(from チェーン)・`@/platform/reminders` をモックする。
 * `@core`(deriveNotificationId)は純関数なので実物を使う(device-sync.test.ts と同じ方針)。
 * `./events` の `toEvent`/`COLUMNS` も実物を使い、行→EventItem 変換の重複を持ち込まない。
 */

interface Call {
  method: string;
  args: unknown[];
}
let calls: Call[] = [];
let queryResult: { data: unknown; error: unknown; count?: number | null } = { data: null, error: null };
let calendarQueryResult: { data: unknown; error: unknown; count?: number | null } = { data: [{ id: 'c1' }], error: null, count: 1 };
let eventPages: Array<{ data: unknown; error: unknown; count?: number | null }> = [];
let calendarPages: Array<{ data: unknown; error: unknown; count?: number | null }> = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  let target = '';
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  chain.select = (...args: unknown[]) => { target = String(args[0] ?? ''); calls.push({ method: 'select', args }); return chain; };
  for (const m of ['is', 'not', 'eq', 'limit', 'order', 'returns']) chain[m] = record(m);
  chain.range = (...args: unknown[]) => { calls.push({ method: 'range', args }); return chain; };
  chain.then = (resolve: (v: unknown) => unknown) => {
    const base = target === 'id'
      ? (calendarPages.shift() ?? calendarQueryResult)
      : (eventPages.shift() ?? queryResult);
    const data = Array.isArray(base.data) ? base.data : null;
    resolve({ ...base, count: base.count ?? (data ? data.length : null) });
  };
  return chain;
}

const from = vi.fn(() => makeChain());
let supabaseValue: unknown = { from };

vi.mock('./supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

const cancelReminder = vi.fn();
const scheduleReminder = vi.fn();
const getPendingReminders = vi.fn();
vi.mock('@/platform/reminders', () => ({
  cancelReminder: (...a: unknown[]) => cancelReminder(...a),
  scheduleReminder: (...a: unknown[]) => scheduleReminder(...a),
  getPendingReminders: () => getPendingReminders(),
  isNotificationSupported: () => true,
}));

async function load() {
  return import('./reminders');
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  calendar_id: 'c1',
  title: '会議',
  all_day: false,
  starts_at: '2026-09-20T10:00:00.000Z',
  ends_at: '2026-09-20T11:00:00.000Z',
  event_date: null,
  note: null,
  source: 'local',
  break_minutes: null,
  hourly_wage: null,
  workplace_label: null,
  shift_template_id: null,
  reminder_minutes: 10,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
});

const ev = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  calendarId: 'c1',
  title: '会議',
  allDay: false,
  startsAt: '2026-09-20T10:00:00.000Z',
  endsAt: '2026-09-20T11:00:00.000Z',
  eventDate: null,
  note: null,
  source: 'local' as const,
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: 10,
  isSecret: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls = [];
  queryResult = { data: null, error: null };
  calendarQueryResult = { data: [{ id: 'c1' }], error: null, count: 1 };
  eventPages = [];
  calendarPages = [];
  from.mockClear();
  supabaseValue = { from };
  cancelReminder.mockReset();
  scheduleReminder.mockReset();
  getPendingReminders.mockReset();
  cancelReminder.mockResolvedValue(undefined);
  scheduleReminder.mockResolvedValue(undefined);
  getPendingReminders.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const expectedId = deriveNotificationId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

describe('syncReminderForEvent', () => {
  it('秘密予定だけ通知名を「予定の通知」に伏せ、通常予定はタイトルを維持する', async () => {
    const { syncReminderForEvent } = await load();
    await syncReminderForEvent(ev({ title: '通常の会議', isSecret: false }));
    await syncReminderForEvent(ev({ title: '秘密の会議', isSecret: true }));
    expect(scheduleReminder.mock.calls[0]![0].title).toBe('通常の会議');
    expect(scheduleReminder.mock.calls[1]![0].title).toBe('予定の通知');
  });
  it('先に同じ導出IDで cancel する', async () => {
    const { syncReminderForEvent } = await load();
    await syncReminderForEvent(ev());
    expect(cancelReminder).toHaveBeenCalledWith(expectedId);
  });

  it('reminderMinutes が設定済み・時刻付き・開始が未来なら schedule する(開始 - N分)', async () => {
    const { syncReminderForEvent } = await load();
    await syncReminderForEvent(ev({ reminderMinutes: 10, startsAt: '2026-09-20T10:00:00.000Z' }));
    expect(scheduleReminder).toHaveBeenCalledTimes(1);
    const arg = scheduleReminder.mock.calls[0]![0];
    expect(arg.id).toBe(expectedId);
    expect(arg.eventId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(arg.title).toBe('会議');
    expect(arg.at.toISOString()).toBe('2026-09-20T09:50:00.000Z');
  });

  it('reminderMinutes が null なら schedule しない(cancel のみ)', async () => {
    const { syncReminderForEvent } = await load();
    await syncReminderForEvent(ev({ reminderMinutes: null }));
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('終日予定は schedule しない', async () => {
    const { syncReminderForEvent } = await load();
    await syncReminderForEvent(
      ev({ allDay: true, startsAt: null, eventDate: '2026-09-20', reminderMinutes: 10 }),
    );
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('通知時刻が既に過去なら schedule しない', async () => {
    const { syncReminderForEvent } = await load();
    // "今" = 2026-09-20T00:00Z。開始 2026-09-20T00:05Z - 10分 = 過去。
    await syncReminderForEvent(
      ev({ reminderMinutes: 10, startsAt: '2026-09-20T00:05:00.000Z' }),
    );
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('startsAt が Date.parse できない値(NaN)なら schedule しない(過去時刻ガードのすり抜け防止)', async () => {
    const { syncReminderForEvent } = await load();
    await syncReminderForEvent(ev({ reminderMinutes: 10, startsAt: '壊れた日付' }));
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('cancelReminder が失敗しても投げず、schedule は継続する', async () => {
    cancelReminder.mockRejectedValue(new Error('unavailable on web'));
    const { syncReminderForEvent } = await load();
    await expect(syncReminderForEvent(ev())).resolves.toBe('ok');
    expect(scheduleReminder).toHaveBeenCalledTimes(1);
  });

  it('scheduleReminder が失敗しても投げない', async () => {
    scheduleReminder.mockRejectedValue(new Error('unavailable on web'));
    const { syncReminderForEvent } = await load();
    await expect(syncReminderForEvent(ev())).resolves.toBe('schedule-failed');
  });
});

describe('resyncAllReminders', () => {
  it('予定とカレンダーが完全0件でも、eventId付きの古い通知だけを取消す', async () => {
    calendarPages = [{ data: [], error: null, count: 0 }];
    eventPages = [{ data: [], error: null, count: 0 }];
    getPendingReminders.mockResolvedValue([
      { id: 703, extra: { eventId: 'deleted-event' } },
      { id: 704, extra: { unrelated: true } },
    ]);
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(cancelReminder).toHaveBeenCalledWith(703);
    expect(cancelReminder).not.toHaveBeenCalledWith(704);
  });

  it('先頭ページ外の現存予定を欠落扱いせず、通知を取消さない', async () => {
    calendarPages = [{ data: [{ id: 'c1' }], error: null, count: 1 }];
    const rows = Array.from({ length: 7 }, (_, index) => row({
      id: `00000000-0000-0000-0000-00000000000${index + 1}`,
    }));
    eventPages = [
      { data: rows.slice(0, 2), error: null, count: 7 },
      { data: rows.slice(2, 4), error: null, count: 7 },
      { data: rows.slice(4, 6), error: null, count: 7 },
      { data: rows.slice(6), error: null, count: 7 },
    ];
    getPendingReminders.mockResolvedValue([
      { id: 700, extra: { eventId: rows[6]!.id } },
    ]);
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(cancelReminder).not.toHaveBeenCalledWith(700);
  });

  it('途中ページの取得失敗時は既存通知を一括取消ししない', async () => {
    calendarPages = [{ data: [{ id: 'c1' }], error: null, count: 1 }];
    eventPages = [
      { data: [row()], error: null, count: 7 },
      { data: null, error: { message: 'timeout' }, count: 7 },
    ];
    getPendingReminders.mockResolvedValue([
      { id: 701, extra: { eventId: 'deleted-event' } },
    ]);
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(cancelReminder).not.toHaveBeenCalledWith(701);
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it('extra.eventIdがないOS予約は所有判定せず取消さない', async () => {
    queryResult = { data: [row()], error: null, count: 1 };
    getPendingReminders.mockResolvedValue([{ id: 702, extra: { unrelated: true } }]);
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(cancelReminder).not.toHaveBeenCalledWith(702);
  });
  it('現存予定・所属カレンダーにないOS予約を取消し、現存分だけ再同期する', async () => {
    queryResult = { data: [row()], error: null };
    getPendingReminders.mockResolvedValue([
      { id: expectedId, extra: { eventId: row().id } },
      { id: 999, extra: { eventId: 'deleted-event' } },
    ]);
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(cancelReminder).toHaveBeenCalledWith(999);
    expect(scheduleReminder).toHaveBeenCalledTimes(1);
  });
  it('reminder_minutes is not null かつ有効な行だけを対象に syncReminderForEvent をループする', async () => {
    queryResult = { data: [row(), row({ id: '11111111-0000-0000-0000-000000000000' })], error: null };
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(calls.some((c) => c.method === 'not' && c.args[0] === 'reminder_minutes')).toBe(true);
    expect(cancelReminder).toHaveBeenCalledTimes(2);
    expect(scheduleReminder).toHaveBeenCalledTimes(2);
  });

  it('通知一覧は上限で打ち切らず全件照合する', async () => {
    queryResult = { data: [], error: null };
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(calls.some((c) => c.method === 'limit')).toBe(false);
  });

  it('supabase 未設定なら何もしない', async () => {
    supabaseValue = null;
    const { resyncAllReminders } = await load();
    await expect(resyncAllReminders()).resolves.toBeUndefined();
    expect(cancelReminder).not.toHaveBeenCalled();
  });

  it('クエリがエラーを返しても投げない', async () => {
    queryResult = { data: null, error: { message: 'boom' } };
    const { resyncAllReminders } = await load();
    await expect(resyncAllReminders()).resolves.toBeUndefined();
    expect(cancelReminder).not.toHaveBeenCalled();
  });
});
