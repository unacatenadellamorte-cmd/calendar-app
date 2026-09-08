/**
 * 優先度の並び規則(ARCHITECTURE-SPINE AD-5 / FR-8)。
 * このモジュールは何も import しない。フロントと Edge Function が共有する。
 *
 * 「一覧の並び」「(将来)重なり時の描画順」「代表予定の選抜」はすべてここを通す。
 * 呼び出し側は自分の表現を core の正規入力型に合わせてから渡す。
 */

/** calendarId → 優先度(小さいほど上位)。未知は最下位相当を返すこと。 */
export type PriorityLookup = (calendarId: string) => number;

/** 並び替えに必要な最小の予定表現(camelCase・UTC ISO / YYYY-MM-DD)。 */
export interface OrderableEvent {
  calendarId: string;
  allDay: boolean;
  /** 時刻付きの開始(UTC ISO)。終日は null。 */
  startsAt: string | null;
  /** 終日の日付(YYYY-MM-DD)。時刻付きは null。 */
  eventDate: string | null;
}

/** `priority`(小さいほど上位)で昇順比較する comparator。 */
export function byPriorityValue(a: { priority: number }, b: { priority: number }): number {
  return a.priority - b.priority;
}

/**
 * 一覧・リストの並び規則:
 *  1. 所属カレンダーの優先度(`priorityOf` 昇順、小さいほど先)
 *  2. 同順位内: 時刻付き → 終日
 *  3. 同順位・両方時刻付き: 開始時刻の早い順(瞬間で比較。ISO の書式差に左右されない)
 *  4. 同順位・両方終日: `eventDate`(YYYY-MM-DD)の早い順
 *  5. すべて同値: 0(呼び出し側の安定ソートが入力順を保つ)
 */
export function compareEventsForList(
  a: OrderableEvent,
  b: OrderableEvent,
  priorityOf: PriorityLookup,
): number {
  const pa = priorityOf(a.calendarId);
  const pb = priorityOf(b.calendarId);
  if (pa !== pb) return pa - pb;

  if (a.allDay !== b.allDay) return a.allDay ? 1 : -1;

  if (a.allDay) {
    // 両方終日: 日付文字列の辞書順 = 日付順。
    return (a.eventDate ?? '') < (b.eventDate ?? '')
      ? -1
      : (a.eventDate ?? '') > (b.eventDate ?? '')
        ? 1
        : 0;
  }

  // 両方時刻付き: 瞬間(ミリ秒)で比較。`Z` / `+00:00` / ミリ秒有無に左右されない。
  const ta = a.startsAt ? Date.parse(a.startsAt) : 0;
  const tb = b.startsAt ? Date.parse(b.startsAt) : 0;
  return ta - tb;
}
