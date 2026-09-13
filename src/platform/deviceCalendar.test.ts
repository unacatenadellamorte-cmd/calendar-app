import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * deviceCalendar.ts の検証。`@capacitor/core` と `@ebarooni/capacitor-calendar` をモックし、
 * 薄いラッパ(プラットフォーム分岐・受け渡しのみ)であることを確認する。
 */

const getPlatform = vi.fn();
const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: (...a: unknown[]) => getPlatform(...a),
    isNativePlatform: (...a: unknown[]) => isNativePlatform(...a),
  },
}));

const requestReadOnlyCalendarAccess = vi.fn();
const requestFullCalendarAccess = vi.fn();
const checkPermission = vi.fn();
const listCalendars = vi.fn();
vi.mock('@ebarooni/capacitor-calendar', () => ({
  CapacitorCalendar: {
    requestReadOnlyCalendarAccess: (...a: unknown[]) => requestReadOnlyCalendarAccess(...a),
    requestFullCalendarAccess: (...a: unknown[]) => requestFullCalendarAccess(...a),
    checkPermission: (...a: unknown[]) => checkPermission(...a),
    listCalendars: (...a: unknown[]) => listCalendars(...a),
  },
  CalendarPermissionScope: { READ_CALENDAR: 'readCalendar' },
}));

const {
  requestDeviceCalendarAccess,
  checkDeviceCalendarPermission,
  listDeviceCalendars,
  isDeviceCalendarSupported,
} = await import('./deviceCalendar');

beforeEach(() => {
  getPlatform.mockReset();
  isNativePlatform.mockReset();
  requestReadOnlyCalendarAccess.mockReset();
  requestFullCalendarAccess.mockReset();
  checkPermission.mockReset();
  listCalendars.mockReset();
});

describe('isDeviceCalendarSupported', () => {
  it('Capacitor.isNativePlatform() をそのまま返す', () => {
    isNativePlatform.mockReturnValue(true);
    expect(isDeviceCalendarSupported()).toBe(true);
    isNativePlatform.mockReturnValue(false);
    expect(isDeviceCalendarSupported()).toBe(false);
  });
});

describe('requestDeviceCalendarAccess', () => {
  it('Android は読み取り専用スコープを要求する', async () => {
    getPlatform.mockReturnValue('android');
    requestReadOnlyCalendarAccess.mockResolvedValue({ result: 'granted' });
    const r = await requestDeviceCalendarAccess();
    expect(r).toBe('granted');
    expect(requestReadOnlyCalendarAccess).toHaveBeenCalledTimes(1);
    expect(requestFullCalendarAccess).not.toHaveBeenCalled();
  });

  it('iOS(Android 以外)は full access を要求する(読み取り専用の権限区分が無いため)', async () => {
    getPlatform.mockReturnValue('ios');
    requestFullCalendarAccess.mockResolvedValue({ result: 'denied' });
    const r = await requestDeviceCalendarAccess();
    expect(r).toBe('denied');
    expect(requestFullCalendarAccess).toHaveBeenCalledTimes(1);
    expect(requestReadOnlyCalendarAccess).not.toHaveBeenCalled();
  });
});

describe('checkDeviceCalendarPermission', () => {
  it('READ_CALENDAR スコープで確認する', async () => {
    checkPermission.mockResolvedValue({ result: 'prompt' });
    const r = await checkDeviceCalendarPermission();
    expect(r).toBe('prompt');
    expect(checkPermission).toHaveBeenCalledWith({ scope: 'readCalendar' });
  });
});

describe('listDeviceCalendars', () => {
  it('id / title / color だけを取り出す(他の付随フィールドは捨てる)', async () => {
    listCalendars.mockResolvedValue({
      result: [
        { id: '1', title: '仕事', color: '#FF0000', internalTitle: 'x', isImmutable: null },
        { id: '2', title: null, color: null },
      ],
    });
    const r = await listDeviceCalendars();
    expect(r).toEqual([
      { id: '1', title: '仕事', color: '#FF0000' },
      { id: '2', title: null, color: null },
    ]);
  });
});
