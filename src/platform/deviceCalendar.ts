import { Capacitor, type PermissionState } from '@capacitor/core';
import { CapacitorCalendar, CalendarPermissionScope } from '@ebarooni/capacitor-calendar';

/**
 * ネイティブブリッジ層(ARCHITECTURE-SPINE Epic5 AD-13 / AD-14、AD-9 と同じ層分離)。
 * `@ebarooni/capacitor-calendar` の薄いラッパ。ロジックは持たない、受け渡し専用。
 *
 * 権限は常に読み取り専用スコープのみを要求する(AD-13)。書き込み系 API
 * (createCalendar / modifyCalendar / deleteCalendar / createEvent 等)は
 * このファイルに限らずアプリ全体で一切呼ばない。
 *
 * iOS には「読み取り専用」という権限区分が存在しない(`requestReadOnlyCalendarAccess()`
 * は Android 専用)。iOS は `requestFullCalendarAccess()` を使うしかないが、
 * アプリのコード自体が書き込み API を呼ばない限り実際の挙動は読み取り専用のまま
 * (Design Notes 参照)。プラットフォーム分岐はこのファイル内に閉じ、呼び出し側
 * (UI・view-model・data-access)に `if (ios/android)` を持ち込まない。
 */

export interface DeviceCalendar {
  id: string;
  /** 表示用タイトル。取得できなければ null(呼び出し側で代替文言を当てる)。 */
  title: string | null;
  /** `#RRGGBB` または `#RRGGBBAA`。取得できなければ null(呼び出し側で既定色を当てる)。 */
  color: string | null;
}

/**
 * ネイティブ(Android/iOS)アプリとして動いているか。Web/PWA ビルドでは
 * `@ebarooni/capacitor-calendar` の Web シムが例外を投げるだけで機能し得ないため、
 * 呼び出し側(UI)はこれで機能自体の表示可否を判断する。
 */
export function isDeviceCalendarSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * OS の権限ダイアログを出す。Android は読み取り専用スコープ、それ以外(iOS)は
 * full access(iOS に読み取り専用の権限区分が無いため)。
 */
export async function requestDeviceCalendarAccess(): Promise<PermissionState> {
  const platform = Capacitor.getPlatform();
  const { result } =
    platform === 'android'
      ? await CapacitorCalendar.requestReadOnlyCalendarAccess()
      : await CapacitorCalendar.requestFullCalendarAccess();
  return result;
}

/** 現在の権限状態を確認する(要求はしない)。 */
export async function checkDeviceCalendarPermission(): Promise<PermissionState> {
  const { result } = await CapacitorCalendar.checkPermission({
    scope: CalendarPermissionScope.READ_CALENDAR,
  });
  return result;
}

/** 端末上のカレンダー一覧。 */
export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  const { result } = await CapacitorCalendar.listCalendars();
  return result.map((c) => ({ id: c.id, title: c.title, color: c.color }));
}
