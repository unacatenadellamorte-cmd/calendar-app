import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { invokeFn } from './edge';

/**
 * 取り込むカレンダーの選択(Story 3.2)。data-access レイヤ。
 * Google API 呼び出しは google-calendars Edge Function のみ。ここは関数呼び出しと
 * connection_calendars(カタログ)の SELECT だけ。すべて Result を返す。
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
  return 'connection/calendars-failed';
}

/**
 * カタログ(直近の取得結果)を DB からそのまま読む。オフラインでも可。
 * 取り込み状態(sync_state)もマージする。sync_state が引けなくてもカタログは返す。
 */
export async function listConnectionCalendars(): Promise<Result<GoogleCalendarChoice[]>> {
  if (!supabase) return err(appError('connection/unavailable', 'connection/unavailable'));
  try {
    const { data, error } = await selectActive('connection_calendars', COLUMNS)
      .order('summary', { ascending: true })
      .returns<ConnectionCalendarRow[]>();
    if (error) return err(appError('data/query', 'data/query', error));

    const { data: syncRows } = await supabase
      .from('sync_state')
      .select('external_calendar_id,last_synced_at,last_error')
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

/** Google の calendarList を取り直してカタログを更新する(オンライン必須)。 */
export async function refreshGoogleCalendars(): Promise<Result<{ count: number }>> {
  return invokeFn<{ count: number }>(
    'google-calendars',
    { action: 'refresh' },
    slugToKey,
    'connection/calendars-failed',
  );
}

/** 候補を1つオン/オフする(オンで calendars(source=google)行が作られる)。 */
export async function setGoogleCalendarSelected(
  externalCalendarId: string,
  selected: boolean,
): Promise<Result<void>> {
  return invokeFn<void>(
    'google-calendars',
    { action: 'set', externalCalendarId, selected },
    slugToKey,
    'connection/calendars-failed',
  );
}
