import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { invokeFn } from './edge';

/**
 * 取り込むカレンダーの選択(Story 3.2)。data-access レイヤ。
 * Google API 呼び出しは google-calendars Edge Function のみ。ここは関数呼び出しと
 * connection_calendars(カタログ)の SELECT だけ。すべて Result を返す。
 *
 * 複数 Google アカウント対応(CAP-3): どの関数も対象の接続 ID を必須で受け取る。
 * google-calendars 関数は connection_id 省略時、active な接続が2件以上だと
 * 400 `connection/ambiguous` を返すため、クライアントは常に明示する。
 */

export interface GoogleCalendarChoice {
  externalCalendarId: string;
  summary: string;
  /** 正規化済み #RRGGBB。取得できていなければ null。 */
  backgroundColor: string | null;
  selected: boolean;
  /** 最後に予定を取り込めた時刻(UTC ISO)。まだ / 未選択なら null(Story 3.3)。 */
  lastSyncedAt: string | null;
  /** 直近の取り込み失敗(無ければ null、Story 3.3)。 */
  lastError: string | null;
}

interface ConnectionCalendarRow {
  external_calendar_id: string;
  summary: string;
  background_color: string | null;
  selected: boolean;
}

interface SyncStateRow {
  external_calendar_id: string;
  last_synced_at: string | null;
  last_error: string | null;
}

const COLUMNS = 'external_calendar_id,summary,background_color,selected';

function slugToKey(slug: string): string {
  if (slug === 'reauth-needed') return 'connection/reauth-needed';
  if (slug === 'not-connected') return 'connection/not-connected';
  if (slug === 'connection/ambiguous') return 'connection/ambiguous';
  return 'connection/calendars-failed';
}

/**
 * 指定した接続のカタログ(直近の取得結果)を DB からそのまま読む。オフラインでも可。
 * 取り込み状態(sync_state)も同じ接続の分だけマージする(別アカウントに同じ
 * external_calendar_id の共有カレンダーがあっても混ざらない)。
 * sync_state が引けなくてもカタログは返す。
 */
export async function listConnectionCalendars(
  connectionId: string,
): Promise<Result<GoogleCalendarChoice[]>> {
  if (!supabase) return err(appError('connection/unavailable', 'connection/unavailable'));
  try {
    const { data, error } = await selectActive('connection_calendars', COLUMNS)
      .eq('connection_id', connectionId)
      .order('summary', { ascending: true })
      .returns<ConnectionCalendarRow[]>();
    if (error) return err(appError('data/query', 'data/query', error));

    const { data: syncRows } = await supabase
      .from('sync_state')
      .select('external_calendar_id,last_synced_at,last_error')
      .eq('connection_id', connectionId)
      .returns<SyncStateRow[]>();
    const syncByCal = new Map((syncRows ?? []).map((s) => [s.external_calendar_id, s]));

    return ok(
      (data ?? []).map((r) => {
        const s = syncByCal.get(r.external_calendar_id);
        return {
          externalCalendarId: r.external_calendar_id,
          summary: r.summary,
          backgroundColor: r.background_color,
          selected: r.selected,
          lastSyncedAt: s?.last_synced_at ?? null,
          lastError: s?.last_error ?? null,
        };
      }),
    );
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/** 指定した接続について Google の calendarList を取り直してカタログを更新する(オンライン必須)。 */
export async function refreshGoogleCalendars(
  connectionId: string,
): Promise<Result<{ count: number }>> {
  return invokeFn<{ count: number }>(
    'google-calendars',
    { action: 'refresh', connection_id: connectionId },
    slugToKey,
    'connection/calendars-failed',
  );
}

/** 指定した接続の候補を1つオン/オフする(オンで calendars(source=google)行が作られる)。 */
export async function setGoogleCalendarSelected(
  connectionId: string,
  externalCalendarId: string,
  selected: boolean,
): Promise<Result<void>> {
  return invokeFn<void>(
    'google-calendars',
    { action: 'set', connection_id: connectionId, externalCalendarId, selected },
    slugToKey,
    'connection/calendars-failed',
  );
}
