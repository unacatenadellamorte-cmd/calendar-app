import { supabase } from './supabase';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { invokeFn } from './edge';
import { resyncAllReminders } from './reminders';
import { refreshFeaturedWidget } from '@/platform/widget';

/**
 * Google カレンダーの予定取り込み(Story 3.3)。data-access レイヤ。
 * Google API 呼び出し・refresh_token 復号は sync-calendars Edge Function のみ。
 * ここは関数呼び出しと sync_state(取り込み状態)の SELECT だけ。すべて Result を返す。
 */

/** 「今すぐ取り込み」1回の結果。 */
export interface SyncRunResult {
  /** 取り込めたカレンダー(新規/更新・削除の件数つき)。 */
  synced: { calendar: string; upserted: number; deleted: number }[];
  /** 取り込めなかったカレンダー。 */
  errors: { calendar: string; error: string }[];
}

/** 取り込み単位「接続 × カレンダー」の状態。 */
export interface SyncStateItem {
  /** 対応する calendars 行の id(未作成なら null)。 */
  calendarId: string | null;
  externalCalendarId: string;
  /** 最後に取り込めた時刻(UTC ISO)。まだなら null。 */
  lastSyncedAt: string | null;
  /** 直近の失敗内容(無ければ null)。 */
  lastError: string | null;
}

interface SyncStateRow {
  calendar_id: string | null;
  external_calendar_id: string;
  last_synced_at: string | null;
  last_error: string | null;
}

const COLUMNS = 'calendar_id,external_calendar_id,last_synced_at,last_error';

function slugToKey(slug: string): string {
  if (slug === 'reauth-needed') return 'connection/reauth-needed';
  if (slug === 'not-connected') return 'connection/not-connected';
  if (slug === 'not-authenticated') return 'connection/not-authenticated';
  return 'sync/failed';
}

/**
 * 選択済みの Google カレンダーの予定を今すぐ取り込む(オンライン必須)。
 * 成功時は、リマインダー設定済みの全予定を再同期し(Story 5.4、取り込みが予定の
 * 時刻を書き換え得るため)、ホーム画面ウィジェットも最新化する(Story 5.6)。
 * どちらも自身の内部で失敗を吸収するため、この呼び出しの結果には影響しない。
 */
export async function syncGoogleCalendarsNow(): Promise<Result<SyncRunResult>> {
  const result = await invokeFn<SyncRunResult>(
    'sync-calendars',
    { scheduled: false },
    slugToKey,
    'sync/failed',
  );
  if (result.ok) {
    await resyncAllReminders();
    await refreshFeaturedWidget();
  }
  return result;
}

/** 自分の取り込み状態を一覧する。オフラインは data/offline。 */
export async function listSyncState(): Promise<Result<SyncStateItem[]>> {
  if (!supabase) return err(appError('connection/unavailable', 'connection/unavailable'));
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select(COLUMNS)
      .returns<SyncStateRow[]>();
    if (error) {
      if (isNetworkError(error)) return err(appError('data/offline', 'data/offline', error));
      return err(appError('data/query', 'data/query', error));
    }
    return ok(
      (data ?? []).map((r) => ({
        calendarId: r.calendar_id,
        externalCalendarId: r.external_calendar_id,
        lastSyncedAt: r.last_synced_at,
        lastError: r.last_error,
      })),
    );
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}
