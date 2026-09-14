import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { getDeviceConnection } from './device-connections';
import { listDeviceEventsInRange } from '@/platform/deviceCalendar';
import { normalizeDeviceEvent, toDeviceEventRow, deletedExternalIds, type EventRow } from '@core';

/**
 * 端末カレンダーの予定取り込み(Story 5.3、ARCHITECTURE-SPINE Epic5 AD-14 / AD-17)。
 * `src/data/google-sync.ts` と対の形だが、Google と違い service_role RPC
 * (`apply_calendar_sync` 等)は一切呼ばない ── 認証済みクライアントの `supabase-js`
 * 直接呼び出しで既存 RLS の範囲内のみ書き込む。`sync_state` への書き込みもしない
 * (このストーリーの AC は取り込み結果の成否表示を要求していない)。
 */

/** 「今すぐ取り込み」1回の結果。`SyncRunResult`(google-sync.ts)と同じ形。 */
export interface SyncRunResult {
  synced: { calendar: string; upserted: number; deleted: number }[];
  errors: { calendar: string; error: string }[];
}

const UNAVAILABLE = appError('connection/unavailable', 'connection/unavailable');
/** 削除差分 SELECT の安全マージン(暴走的な行数増加からの防御。通常はこれよりずっと少ない)。 */
const EXISTING_EVENTS_LIMIT = 2000;

interface SelectedCalendarRow {
  calendar_id: string | null;
  external_calendar_id: string;
  summary: string;
}

interface ExistingEventRow {
  external_id: string | null;
  starts_at: string | null;
  event_date: string | null;
}

/** 今 - 60日 〜 今 + 400日(`supabase/functions/sync-calendars` と同じ時間窓)。 */
function syncWindowMs(): { min: number; max: number } {
  const now = Date.now();
  return { min: now - 60 * 86_400_000, max: now + 400 * 86_400_000 };
}

/** `event_date`(YYYY-MM-DD)を、UTC ではなくローカルタイムゾーンの深夜として ms 化する。 */
function localDateStringToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getTime();
}

/**
 * 時刻付きは `starts_at`(UTC ISO、`Date.parse` で正しい)、終日は `event_date` を
 * ローカルタイムゾーンの深夜として比較する(`toLocalDateString` が終日をローカル日付に
 * 変換したのと対称 ── ここを `Date.parse` で UTC 解釈すると、その対称性が崩れてずれ得る)。
 */
function isWithinWindow(row: ExistingEventRow, min: number, max: number): boolean {
  const ms = row.starts_at
    ? Date.parse(row.starts_at)
    : row.event_date
      ? localDateStringToMs(row.event_date)
      : NaN;
  return !Number.isNaN(ms) && ms >= min && ms <= max;
}

/** 1カレンダー分の取り込みを実行する(呼び出し側で try/catch する)。 */
async function syncOneCalendar(
  connectionId: string,
  target: { calendar_id: string; external_calendar_id: string; summary: string },
  rawEvents: Awaited<ReturnType<typeof listDeviceEventsInRange>>,
  windowMin: number,
  windowMax: number,
): Promise<{ calendar: string; upserted: number; deleted: number }> {
  const byExternalId = new Map<string, EventRow>();
  for (const raw of rawEvents) {
    if (raw.calendarId !== target.external_calendar_id) continue;
    const n = normalizeDeviceEvent(raw);
    if (n) byExternalId.set(n.externalId, toDeviceEventRow(n));
  }

  if (byExternalId.size > 0) {
    const externalIds = [...byExternalId.keys()];
    // `events_external_uniq` は `(connection_id, external_id) where connection_id is not null`
    // という部分ユニークインデックスで、supabase-js の `upsert({onConflict})` は列名しか渡せず
    // 部分インデックスの述語を表現できないため 42P10 で拒否される。手動で
    // SELECT → 既存なら UPDATE(deleted_at 復活含む)/ 無ければ INSERT に分ける。
    // 論理削除済みの行もこの一意インデックスの対象になるため、deleted_at を問わず検索する
    // (`selectActive` は使わない)。
    const { data: existing, error: existingError } = await supabase!
      .from('events')
      .select('id,external_id')
      .eq('connection_id', connectionId)
      .in('external_id', externalIds)
      .returns<{ id: string; external_id: string }[]>();
    if (existingError) throw new Error(existingError.message);

    const existingIdByExternalId = new Map(
      (existing ?? []).map((r) => [r.external_id, r.id] as const),
    );

    const toInsert: Array<EventRow & { calendar_id: string; connection_id: string; source: 'device' }> =
      [];
    for (const [externalId, row] of byExternalId) {
      const existingId = existingIdByExternalId.get(externalId);
      if (existingId) {
        const { error: updateError } = await supabase!
          .from('events')
          .update({ ...row, calendar_id: target.calendar_id, deleted_at: null })
          .eq('id', existingId);
        if (updateError) throw new Error(updateError.message);
      } else {
        toInsert.push({
          ...row,
          calendar_id: target.calendar_id,
          connection_id: connectionId,
          source: 'device' as const,
        });
      }
    }
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase!.from('events').insert(toInsert);
      if (insertError) throw new Error(insertError.message);
    }
  }

  const { data: existingRows, error: selectError } = await selectActive(
    'events',
    'external_id,starts_at,event_date',
  )
    .eq('connection_id', connectionId)
    .eq('calendar_id', target.calendar_id)
    .limit(EXISTING_EVENTS_LIMIT)
    .returns<ExistingEventRow[]>();
  if (selectError) throw new Error(selectError.message);

  const storedIds = (existingRows ?? [])
    .filter((r) => r.external_id !== null && isWithinWindow(r, windowMin, windowMax))
    .map((r) => r.external_id!);
  const fetchedIds = [...byExternalId.keys()];
  const toDelete = deletedExternalIds(storedIds, fetchedIds);

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase!
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('connection_id', connectionId)
      .eq('calendar_id', target.calendar_id)
      .in('external_id', toDelete);
    if (deleteError) throw new Error(deleteError.message);
  }

  return { calendar: target.summary, upserted: byExternalId.size, deleted: toDelete.length };
}

async function runSyncDeviceCalendarsNow(): Promise<Result<SyncRunResult>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const connectionResult = await getDeviceConnection();
    if (!connectionResult.ok) return connectionResult;
    const connection = connectionResult.value;
    if (!connection) return ok({ synced: [], errors: [] });

    const { data: ccRows, error: ccError } = await selectActive(
      'connection_calendars',
      'calendar_id,external_calendar_id,summary',
    )
      .eq('connection_id', connection.id)
      .eq('selected', true)
      .returns<SelectedCalendarRow[]>();
    if (ccError) return err(appError('data/query', 'data/query', ccError));

    const targets = (ccRows ?? []).filter(
      (r): r is SelectedCalendarRow & { calendar_id: string } => r.calendar_id !== null,
    );
    if (targets.length === 0) return ok({ synced: [], errors: [] });

    const { min: windowMin, max: windowMax } = syncWindowMs();
    const rawEvents = await listDeviceEventsInRange(windowMin, windowMax);

    const synced: SyncRunResult['synced'] = [];
    const errors: SyncRunResult['errors'] = [];

    for (const target of targets) {
      try {
        synced.push(await syncOneCalendar(connection.id, target, rawEvents, windowMin, windowMax));
      } catch (e) {
        console.warn(`device-sync: ${target.summary} failed`, (e as Error)?.message);
        errors.push({ calendar: target.summary, error: 'sync-failed' });
      }
    }

    return ok({ synced, errors });
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('sync/failed', 'sync/failed', e));
  }
}

/** 実行中の呼び出しがあれば同じ Promise を返す(フォアグラウンド復帰と手動実行の同時発火対策)。 */
let inFlight: Promise<Result<SyncRunResult>> | null = null;

/**
 * 選択済みの端末カレンダーの予定を今すぐ取り込む(フォアグラウンド復帰 / 手動実行の両方から呼ばれる)。
 * 端末カレンダー未接続なら何もせず成功扱い(エラーにしない)。1カレンダーの失敗は他を止めない。
 * 実行中に再度呼ばれても新たな実行は起こさず、進行中の Promise を共有する。
 */
export function syncDeviceCalendarsNow(): Promise<Result<SyncRunResult>> {
  if (inFlight) return inFlight;
  const run = runSyncDeviceCalendarsNow().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}
