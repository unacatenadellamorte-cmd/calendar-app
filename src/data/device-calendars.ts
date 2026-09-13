import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { listDeviceCalendars as listNativeCalendars } from '@/platform/deviceCalendar';

/**
 * 取り込むカレンダーの選択(Story 5.2)。data-access レイヤ。
 * `src/data/google-calendars.ts` と対の形だが、書き込みは service_role RPC ではなく
 * 認証済みクライアントの `supabase-js` 直接呼び出しで既存 RLS の範囲内のみ行う
 * (ARCHITECTURE-SPINE Epic5 AD-17)。`upsert_connection_calendars` /
 * `set_google_calendar_selection`(Story 3.2 の SQL)と同じ振る舞いを TypeScript
 * 側の逐次呼び出しで再現する。アトミック性についての判断は spec の Design Notes 参照。
 */

export interface DeviceCalendarChoice {
  externalCalendarId: string;
  summary: string;
  /** `#RRGGBB`。取得できていなければ null。 */
  backgroundColor: string | null;
  selected: boolean;
}

interface ConnectionCalendarRow {
  external_calendar_id: string;
  summary: string;
  background_color: string | null;
  selected: boolean;
}

interface ActiveCatalogRow {
  id: string;
  external_calendar_id: string;
  calendar_id: string | null;
}

interface SelectionRow {
  id: string;
  summary: string;
  background_color: string | null;
  calendar_id: string | null;
}

const UNAVAILABLE = appError('connection/unavailable', 'connection/unavailable');
const NOT_FOUND = appError('connection/calendar-not-found', 'connection/calendar-not-found');
const COLUMNS = 'external_calendar_id,summary,background_color,selected';
/** カレンダー名・色が取得できない/不正なときに使う既定値(`DeviceCalendarPicker` の表示とも共通)。 */
export const DEFAULT_NAME = '端末のカレンダー';
export const DEFAULT_COLOR = '#7A7A7A';

function toChoice(row: ConnectionCalendarRow): DeviceCalendarChoice {
  return {
    externalCalendarId: row.external_calendar_id,
    summary: row.summary,
    backgroundColor: row.background_color,
    selected: row.selected,
  };
}

/**
 * `#RRGGBBAA` → `#RRGGBB`(calendars.color の CHECK 制約はアルファ無しの6桁のみ)。
 * 6桁にも8桁にもマッチしない想定外フォーマットは `DEFAULT_COLOR` にフォールバックする
 * (生の値を calendars.color に流すと CHECK 制約違反で Postgres エラーになるため)。
 */
function normalizeColor(color: string | null): string | null {
  if (!color) return null;
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  if (/^#[0-9A-Fa-f]{8}$/.test(color)) return color.slice(0, 7);
  return DEFAULT_COLOR;
}

/**
 * calendars.name の CHECK 制約(trim 後1〜100文字)に合わせて正規化する。
 * trim 後に空、または端末側のタイトルが無ければ `DEFAULT_NAME`。100文字を超える分は切り詰める。
 */
function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_NAME;
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}

/** カタログ(直近の取得結果)を DB からそのまま読む。オフラインでも可。 */
export async function listDeviceCalendars(
  connectionId: string,
): Promise<Result<DeviceCalendarChoice[]>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await selectActive('connection_calendars', COLUMNS)
      .eq('connection_id', connectionId)
      .order('summary', { ascending: true })
      .returns<ConnectionCalendarRow[]>();
    if (error) return err(appError('data/query', 'data/query', error));
    return ok((data ?? []).map(toChoice));
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/**
 * 端末の一覧を取り直してカタログを更新する。`upsert_connection_calendars`(Story 3.2)
 * と同じ振る舞い: 応答にある候補を upsert、応答に無くなった候補はカタログから外し
 * (`deleted_at` セット)、選択済みなら対応する `calendars` 行も論理削除する。
 */
export async function refreshDeviceCalendarCatalog(
  connectionId: string,
): Promise<Result<{ count: number }>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const native = await listNativeCalendars();

    // iOS は権限が後から取り消されても listCalendars() が例外を投げず空配列を返す。
    // 既存の選択済みカタログがあるのに空配列が来た場合、それを「全カレンダーが消えた」と
    // 解釈して丸ごと論理削除すると、権限取り消しという普通の操作で選択が全部消えてしまう。
    // 何もせずエラーで返す(次に権限を戻して再取得すれば復旧する)。
    if (native.length === 0) {
      const { data: existing, error: existingError } = await selectActive(
        'connection_calendars',
        'id',
      )
        .eq('connection_id', connectionId)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (existingError) return err(appError('data/query', 'data/query', existingError));
      if (existing) {
        return err(appError('connection/device-unavailable', 'connection/device-unavailable'));
      }
      return ok({ count: 0 });
    }

    const ids = new Set(native.map((c) => c.id));
    const rows = native.map((c) => ({
      connection_id: connectionId,
      external_calendar_id: c.id,
      summary: c.title ?? '',
      background_color: normalizeColor(c.color),
      deleted_at: null,
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('connection_calendars')
        .upsert(rows, { onConflict: 'connection_id,external_calendar_id' });
      if (upsertError) return err(appError('data/query', 'data/query', upsertError));
    }

    // 応答に無くなったカレンダーはカタログから外す。
    const { data: activeRows, error: selectError } = await selectActive(
      'connection_calendars',
      'id,external_calendar_id,calendar_id',
    )
      .eq('connection_id', connectionId)
      .returns<ActiveCatalogRow[]>();
    if (selectError) return err(appError('data/query', 'data/query', selectError));

    const gone = (activeRows ?? []).filter((r) => !ids.has(r.external_calendar_id));
    if (gone.length > 0) {
      const goneIds = gone.map((r) => r.id);
      const { error: deactivateError } = await supabase
        .from('connection_calendars')
        .update({ deleted_at: new Date().toISOString(), selected: false })
        .in('id', goneIds);
      if (deactivateError) return err(appError('data/query', 'data/query', deactivateError));

      // 外れたカレンダーの calendars 行も論理削除。
      const calendarIds = gone
        .map((r) => r.calendar_id)
        .filter((id): id is string => id !== null);
      if (calendarIds.length > 0) {
        const { error: calError } = await supabase
          .from('calendars')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', calendarIds);
        if (calError) return err(appError('data/query', 'data/query', calError));
      }
    }

    return ok({ count: rows.length });
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('connection/device-unavailable', 'connection/device-unavailable', e));
  }
}

/**
 * 候補を1つオン/オフする。`set_google_calendar_selection`(Story 3.2)と同じ手順を
 * 逐次クライアント呼び出しで再現する(AD-17。security definer RPC は作らない):
 * オン → 既存 `calendars` 行があれば復活(優先度は最下位へ再採番)、無ければ
 * insert(BEFORE INSERT トリガが採番)。オフ → 対応 `calendars` 行を論理削除。
 * どちらも最後に `connection_calendars` の `selected`/`calendar_id` を更新する。
 */
export async function setDeviceCalendarSelected(
  connectionId: string,
  externalCalendarId: string,
  selected: boolean,
): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data: cc, error: ccError } = await selectActive(
      'connection_calendars',
      'id,summary,background_color,calendar_id',
    )
      .eq('connection_id', connectionId)
      .eq('external_calendar_id', externalCalendarId)
      .maybeSingle<SelectionRow>();
    if (ccError) return err(appError('data/query', 'data/query', ccError));
    if (!cc) return err(NOT_FOUND);

    if (selected) {
      const name = normalizeName(cc.summary);
      const color = cc.background_color ?? DEFAULT_COLOR;
      let calendarId = cc.calendar_id;

      if (calendarId) {
        // 論理削除されていた行を復活させる。元の priority スロットは他カレンダーの
        // 並べ替えで奪われている可能性があるため、最下位に採番し直す
        // (BEFORE INSERT トリガは UPDATE では効かない)。
        const { data: top, error: topError } = await selectActive('calendars', 'priority')
          .order('priority', { ascending: false })
          .limit(1)
          .maybeSingle<{ priority: number }>();
        if (topError) return err(appError('data/query', 'data/query', topError));
        const nextPriority = (top?.priority ?? -1) + 1;

        const { error: reviveError } = await supabase
          .from('calendars')
          .update({ deleted_at: null, name, color, priority: nextPriority })
          .eq('id', calendarId);
        if (reviveError) return err(appError('data/query', 'data/query', reviveError));
      } else {
        const { data: created, error: insertError } = await supabase
          .from('calendars')
          .insert({
            name,
            color,
            source: 'device',
            external_connection_id: connectionId,
            external_calendar_id: externalCalendarId,
          })
          .select('id')
          .single<{ id: string }>();
        if (insertError) return err(appError('data/query', 'data/query', insertError));
        calendarId = created.id;
      }

      const { error: updateCcError } = await supabase
        .from('connection_calendars')
        .update({ selected: true, calendar_id: calendarId, deleted_at: null })
        .eq('id', cc.id);
      if (updateCcError) return err(appError('data/query', 'data/query', updateCcError));
      return ok(undefined);
    }

    if (cc.calendar_id) {
      const { error: deleteError } = await supabase
        .from('calendars')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', cc.calendar_id);
      if (deleteError) return err(appError('data/query', 'data/query', deleteError));
    }
    const { error: updateCcError } = await supabase
      .from('connection_calendars')
      .update({ selected: false })
      .eq('id', cc.id);
    if (updateCcError) return err(appError('data/query', 'data/query', updateCcError));
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('connection/device-unavailable', 'connection/device-unavailable', e));
  }
}
