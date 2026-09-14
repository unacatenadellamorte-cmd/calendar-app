/**
 * `@ebarooni/capacitor-calendar` の生イベントを、このアプリの予定形に正規化する純ロジック
 * (Story 5.3、ARCHITECTURE-SPINE Epic5 AD-14 / AD-17)。`google-events.ts` と対の形。
 *
 * パッケージ外には何も依存しない(`EventRow` 型のみ同じパッケージ内の google-events.ts
 * から再利用 ── 構造的に同じ DB 列形なので型を分ける必要がない)。フロント
 * (src/platform/deviceCalendar.ts / src/data/device-sync.ts)だけが使う ──
 * Edge Function からは呼ばれないため、`scripts/sync-edge-shared.mjs` の生成対象には
 * 含めない(google-events.ts のみが対象)。
 */

import type { EventRow } from './google-events';

/** `@ebarooni/capacitor-calendar` の `CalendarEvent` のうち使う分。 */
export interface DeviceEventRaw {
  id?: string;
  title?: string;
  description?: string | null;
  isAllDay?: boolean;
  /** 開始(ms epoch)。 */
  startDate?: number;
  /** 終了(ms epoch)。 */
  endDate?: number;
}

/** 正規化後の予定。構造は `NormalizedGoogleEvent` と同じ。 */
export interface NormalizedDeviceEvent {
  externalId: string;
  title: string;
  note: string | null;
  allDay: boolean;
  /** 時刻付きの開始(UTC ISO)。終日なら null。 */
  startsAt: string | null;
  /** 時刻付きの終了(UTC ISO)。終日なら null。開始以上を保証する。 */
  endsAt: string | null;
  /** 終日の日付(YYYY-MM-DD)。時刻付きなら null。 */
  eventDate: string | null;
}

const TITLE_MAX = 200;
const NOTE_MAX = 2000;

/**
 * `Date` が扱える ms 範囲(ECMA-262 の時刻値の上限 ±100,000,000 日 = ±8.64e15 ms)に
 * 収まるか。範囲外だと `new Date(ms).toISOString()` が `RangeError` を投げるため、
 * 正規化前に弾く(壊れた/桁外れの `startDate`/`endDate` は取り込まずスキップする)。
 */
function isValidEpochMs(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= 8_640_000_000_000_000;
}

/** `Date` のローカル getter で `YYYY-MM-DD` にする(`toISOString` は使わない。Design Notes 参照)。 */
function toLocalDateString(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 端末カレンダーのイベント 1 件を正規化する。取り込むべきでないもの(ID 欠落・
 * 開始時刻が解釈不能)は `null` を返す(呼び出し側はスキップ、既存行があれば
 * 削除差分で論理削除される)。
 *
 * 終日判定は `isAllDay` を見て、`startDate`(ms epoch)を **ローカルタイムゾーンの
 * 年月日**(`getFullYear`/`getMonth`/`getDate`)で `event_date` にする ──
 * Android(UTC 深夜起点)/iOS(ローカル深夜起点)の内部表現差を吸収する簡便法。
 */
export function normalizeDeviceEvent(raw: DeviceEventRaw): NormalizedDeviceEvent | null {
  if (!raw) return null;
  const externalId = typeof raw.id === 'string' ? raw.id : '';
  if (!externalId) return null;

  const titleRaw = (typeof raw.title === 'string' ? raw.title.trim() : '') || '(タイトルなし)';
  const title = titleRaw.slice(0, TITLE_MAX);
  const noteRaw = typeof raw.description === 'string' ? raw.description.trim() : '';
  const note = noteRaw ? noteRaw.slice(0, NOTE_MAX) : null;

  const startMs = raw.startDate;
  if (typeof startMs !== 'number' || !isValidEpochMs(startMs)) return null;

  if (raw.isAllDay) {
    return {
      externalId,
      title,
      note,
      allDay: true,
      startsAt: null,
      endsAt: null,
      eventDate: toLocalDateString(startMs),
    };
  }

  const endMs = raw.endDate;
  // end が無い / 不正(範囲外含む) / 開始より前 なら開始に合わせる(events_time_shape の starts_at <= ends_at を保証)。
  const safeEndMs =
    typeof endMs !== 'number' || !isValidEpochMs(endMs) || endMs < startMs ? startMs : endMs;

  return {
    externalId,
    title,
    note,
    allDay: false,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(safeEndMs).toISOString(),
    eventDate: null,
  };
}

/** 正規化済みの予定を events テーブルの行(snake_case)に写す。`google-events.ts` の `EventRow` を再利用。 */
export function toDeviceEventRow(n: NormalizedDeviceEvent): EventRow {
  return {
    external_id: n.externalId,
    title: n.title,
    note: n.note,
    all_day: n.allDay,
    starts_at: n.startsAt,
    ends_at: n.endsAt,
    event_date: n.eventDate,
  };
}
