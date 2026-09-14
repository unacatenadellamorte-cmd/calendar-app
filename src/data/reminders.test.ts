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
let queryResult: { data: unknown; error: unknown } = { data: null, error: null };

function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of ['select', 'is', 'not', 'eq', 'limit', 'returns']) chain[m] = record(m);
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
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
vi.mock('@/platform/reminders', () => ({
  cancelReminder: (...a: unknown[]) => cancelReminder(...a),
  scheduleReminder: (...a: unknown[]) => scheduleReminder(...a),
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
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls = [];
  queryResult = { data: null, error: null };
  from.mockClear();
  supabaseValue = { from };
  cancelReminder.mockReset();
  scheduleReminder.mockReset();
  cancelReminder.mockResolvedValue(undefined);
  scheduleReminder.mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const expectedId = deriveNotificationId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

describe('syncReminderForEvent', () => {
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
    await expect(syncReminderForEvent(ev())).resolves.toBeUndefined();
    expect(scheduleReminder).toHaveBeenCalledTimes(1);
  });

  it('scheduleReminder が失敗しても投げない', async () => {
    scheduleReminder.mockRejectedValue(new Error('unavailable on web'));
    const { syncReminderForEvent } = await load();
    await expect(syncReminderForEvent(ev())).resolves.toBeUndefined();
  });
});

describe('resyncAllReminders', () => {
  it('reminder_minutes is not null かつ有効な行だけを対象に syncReminderForEvent をループする', async () => {
    queryResult = { data: [row(), row({ id: '11111111-0000-0000-0000-000000000000' })], error: null };
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(calls.some((c) => c.method === 'not' && c.args[0] === 'reminder_minutes')).toBe(true);
    expect(cancelReminder).toHaveBeenCalledTimes(2);
    expect(scheduleReminder).toHaveBeenCalledTimes(2);
  });

  it('暴走防止の安全マージンとして limit(2000) を付ける(device-sync.ts の EXISTING_EVENTS_LIMIT と同じ考え方)', async () => {
    queryResult = { data: [], error: null };
    const { resyncAllReminders } = await load();
    await resyncAllReminders();
    expect(calls.find((c) => c.method === 'limit')?.args).toEqual([2000]);
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
