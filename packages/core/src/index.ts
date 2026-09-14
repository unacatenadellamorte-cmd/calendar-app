/**
 * @calendar-app/core — 純粋ドメイン
 *
 * このパッケージは何も import しない(標準ライブラリのみ)。
 * フロント(src/)と将来の Supabase Edge Function が同じコードを共有する。
 * 依存方向: どのレイヤからも import されてよいが、ここからは何も import しない(ARCHITECTURE-SPINE AD-10)。
 *
 */

export {
  byPriorityValue,
  compareEventsForList,
  type OrderableEvent,
  type PriorityLookup,
} from './priority';

export { selectFeaturedEvents, type FeaturableEvent } from './featured';

export { workedMinutes, monthlyPayEstimate, type PayableShift } from './pay';

export {
  GOOGLE_CALENDAR_SCOPES,
  buildGoogleAuthUrl,
  parseGoogleTokenResponse,
  primaryEmailFromCalendarList,
  type GoogleAuthUrlParams,
  type GoogleTokenParse,
} from './google-oauth';

export {
  normalizeGoogleEvent,
  deletedExternalIds,
  toEventRow,
  type GoogleEventRaw,
  type NormalizedGoogleEvent,
  type EventRow,
} from './google-events';

export {
  normalizeDeviceEvent,
  toDeviceEventRow,
  type DeviceEventRaw,
  type NormalizedDeviceEvent,
} from './device-events';

export { deriveNotificationId } from './notification-id';

/** このパッケージのバージョン識別子(ビルド疎通確認用のプレースホルダ)。 */
export const CORE_VERSION = '0.1.0' as const;

/**
 * 分を「H時間M分」の表示文字列にする最小のユーティリティ。
 * pay-calc(Story 4.3)で実働時間の表示に使う想定の足がかり。副作用なし。
 */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new RangeError('totalMinutes は 0 以上の有限数である必要があります');
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}時間${minutes}分`;
}
