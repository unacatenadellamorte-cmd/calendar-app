import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeDeletion } from '@/data/account-deletion-state';

/**
 * reminders.ts の検証。`@capacitor/local-notifications` をモックし、
 * 薄いラッパ(受け渡しのみ)であることを確認する。
 */

const requestPermissions = vi.fn();
const schedule = vi.fn();
const cancel = vi.fn();
const isNativePlatform = vi.fn();
const getPending = vi.fn();
const removeAllDeliveredNotifications = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
  },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    getPending: () => getPending(),
    removeAllDeliveredNotifications: () => removeAllDeliveredNotifications(),
    requestPermissions: (...a: unknown[]) => requestPermissions(...a),
    schedule: (...a: unknown[]) => schedule(...a),
    cancel: (...a: unknown[]) => cancel(...a),
  },
}));

const { requestNotificationPermission, scheduleReminder, cancelReminder, clearAccountNotifications } =
  await import('./reminders');

beforeEach(() => {
  requestPermissions.mockReset();
  schedule.mockReset();
  cancel.mockReset();
  isNativePlatform.mockReset();
  getPending.mockReset();
  removeAllDeliveredNotifications.mockReset();
});

it('遅延した通知予約を待って消去し、削除後の再予約を拒否する', async () => {
  isNativePlatform.mockReturnValue(true);
  let complete!: () => void;
  schedule.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  getPending.mockResolvedValue({ notifications: [{ id: 123 }] });
  const options = { id: 123, eventId: '旧予定', title: '旧タイトル', at: new Date() };
  const scheduled = scheduleReminder(options);
  writeDeletion({ userId: '本人', phase: 'local' });
  const clearing = clearAccountNotifications();
  expect(getPending).not.toHaveBeenCalled();
  complete();
  await Promise.all([scheduled, clearing]);
  expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 123 }] });
  expect(removeAllDeliveredNotifications).toHaveBeenCalledTimes(1);
  await scheduleReminder(options);
  expect(schedule).toHaveBeenCalledTimes(1);
});

describe('requestNotificationPermission', () => {
  it('requestPermissions() の display をそのまま返す', async () => {
    requestPermissions.mockResolvedValue({ display: 'granted' });
    const r = await requestNotificationPermission();
    expect(r).toBe('granted');
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe('isNotificationSupported', () => {
  it('ネイティブプラットフォームだけを通知対応として返す', async () => {
    const { isNotificationSupported } = await import('./reminders');
    isNativePlatform.mockReturnValue(true);
    expect(isNotificationSupported()).toBe(true);
    isNativePlatform.mockReturnValue(false);
    expect(isNotificationSupported()).toBe(false);
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
