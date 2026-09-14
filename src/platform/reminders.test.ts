import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * reminders.ts の検証。`@capacitor/local-notifications` をモックし、
 * 薄いラッパ(受け渡しのみ)であることを確認する。
 */

const requestPermissions = vi.fn();
const schedule = vi.fn();
const cancel = vi.fn();
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: (...a: unknown[]) => requestPermissions(...a),
    schedule: (...a: unknown[]) => schedule(...a),
    cancel: (...a: unknown[]) => cancel(...a),
  },
}));

const { requestNotificationPermission, scheduleReminder, cancelReminder } =
  await import('./reminders');

beforeEach(() => {
  requestPermissions.mockReset();
  schedule.mockReset();
  cancel.mockReset();
});

describe('requestNotificationPermission', () => {
  it('requestPermissions() の display をそのまま返す', async () => {
    requestPermissions.mockResolvedValue({ display: 'granted' });
    const r = await requestNotificationPermission();
    expect(r).toBe('granted');
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleReminder', () => {
  it('id/title/schedule.at/extra.eventId を積んで schedule() を呼ぶ(allowWhileIdle: true)', async () => {
    schedule.mockResolvedValue({ notifications: [] });
    const at = new Date('2026-09-20T10:00:00.000Z');
    await scheduleReminder({ id: 123, eventId: 'e1', title: '会議', at });
    expect(schedule).toHaveBeenCalledTimes(1);
    const arg = schedule.mock.calls[0]![0];
    expect(arg.notifications).toHaveLength(1);
    expect(arg.notifications[0]).toMatchObject({
      id: 123,
      title: '会議',
      extra: { eventId: 'e1' },
      schedule: { at, allowWhileIdle: true },
    });
    expect(typeof arg.notifications[0].body).toBe('string');
  });
});

describe('cancelReminder', () => {
  it('id を1件だけ渡して cancel() を呼ぶ', async () => {
    cancel.mockResolvedValue(undefined);
    await cancelReminder(456);
    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 456 }] });
  });
});
