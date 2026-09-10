/**
 * Google Calendar API v3 のイベント JSON を、このアプリの予定形に正規化する純ロジック
 * (Story 3.3、ARCHITECTURE-SPINE AD-2 / AD-7 / AD-10)。
 *
 * このモジュールは何も import しない。フロントは import しないが、Edge Function
 * (Deno、ローカルに無い)が同じ規則を関数内に複製するための一次ソース。
 * 秘匿情報は扱わない。時刻は必ず UTC の ISO 文字列にする。
 */

/** Google Calendar API のイベント(必要な部分だけ)。 */
export interface GoogleEventRaw {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

/** 正規化後の予定。events テーブルの列に対応する。 */
export interface NormalizedGoogleEvent {
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
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Google イベント 1 件を正規化する。取り込むべきでないもの(キャンセル済み・
 * ID 欠落・開始情報なし・時刻が解釈不能)は `null` を返す(呼び出し側はスキップ、
 * 既存行があれば削除差分で論理削除される)。
 */
export function normalizeGoogleEvent(raw: GoogleEventRaw): NormalizedGoogleEvent | null {
  if (!raw || raw.status === 'cancelled') return null;
  const externalId = typeof raw.id === 'string' ? raw.id : '';
  if (!externalId) return null;

  const title = (typeof raw.summary === 'string' ? raw.summary.trim() : '') || '(タイトルなし)';
  const noteRaw = typeof raw.description === 'string' ? raw.description.trim() : '';
  const note = noteRaw ? noteRaw.slice(0, NOTE_MAX) : null;

  const startDate = raw.start?.date;
  if (typeof startDate === 'string' && DATE_ONLY.test(startDate)) {
    return {
      externalId,
      title: title.slice(0, TITLE_MAX),
      note,
      allDay: true,
      startsAt: null,
      endsAt: null,
      eventDate: startDate,
    };
  }

  const startDateTime = raw.start?.dateTime;
  if (typeof startDateTime === 'string') {
    const startMs = Date.parse(startDateTime);
    if (Number.isNaN(startMs)) return null;
    const endSource = raw.end?.dateTime;
    const endMs = typeof endSource === 'string' ? Date.parse(endSource) : NaN;
    // end が無い / 不正 / 開始より前 なら開始に合わせる(events_time_shape の starts_at <= ends_at を保証)。
    const safeEndMs = Number.isNaN(endMs) || endMs < startMs ? startMs : endMs;
    return {
      externalId,
      title: title.slice(0, TITLE_MAX),
      note,
      allDay: false,
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(safeEndMs).toISOString(),
      eventDate: null,
    };
  }

  return null;
}

/**
 * 前回取り込んだ external_id のうち、今回の応答に無いもの(= Google 側で消えた予定)。
 * Edge Function 側は SQL の削除差分で判定するが、規則を1か所に置きテスト可能にする。
 */
export function deletedExternalIds(
  storedIds: readonly string[],
  fetchedIds: readonly string[],
): string[] {
  const fetched = new Set(fetchedIds);
  return storedIds.filter((id) => !fetched.has(id));
}
