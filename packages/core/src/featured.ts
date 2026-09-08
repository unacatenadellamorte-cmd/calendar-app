/**
 * 代表予定の選抜(ARCHITECTURE-SPINE AD-6 / FR-9・FR-10)。
 * このモジュールは何も import しない(同じ core 内の priority のみ)。
 * アプリ内コンパクトビュー / 将来のウィジェット・通知が同じ入力で同じ結果を得る。
 *
 * 順序規則そのものは `compareEventsForList`(Story 2.2)に委譲し、
 * ここは「対象の絞り込み(now 以降 / 進行中)」と「limit の打ち切り」だけを担う。
 */

import { compareEventsForList, type OrderableEvent, type PriorityLookup } from './priority';

/** 選抜に必要な最小の予定表現。`OrderableEvent` に終了時刻を足したもの。 */
export interface FeaturableEvent extends OrderableEvent {
  /** 時刻付きの終了(UTC ISO)。終日、または終了未設定は null。 */
  endsAt: string | null;
}

/**
 * 代表予定を選ぶ。副作用・I/O なし。`now` は呼び出し側が渡す UTC ISO の時点で、
 * 内部で現在時刻を読まない。呼び出し側の実型 `E` を保ったまま返す。
 *
 * 1. 対象は「now 以降に始まる」または「進行中」の予定のみ(過去は出さない)。
 * 2. 優先度が高いカレンダーが先(`priorityOf` 昇順)。
 * 3. 同順位・両方時刻付きは開始時刻の早い順。
 * 4. 同順位内で終日は時刻付きの後。
 * 5. 並べた後 `limit` 件で打ち切り。`limit <= 0` と対象0件は空配列。
 */
export function selectFeaturedEvents<E extends FeaturableEvent>(
  events: readonly E[],
  priorityOf: PriorityLookup,
  now: string,
  limit: number,
): E[] {
  if (limit <= 0) return [];

  const nowMs = Date.parse(now);
  const nowDate = now.slice(0, 10); // "YYYY-MM-DD"

  const inScope = events.filter((event) => {
    if (event.allDay) {
      return (event.eventDate ?? '') >= nowDate;
    }
    if (!event.startsAt) return false;
    // 終了時刻があれば「終わっていない」= 進行中を含む。無ければ「これから始まる」のみ。
    return event.endsAt
      ? Date.parse(event.endsAt) > nowMs
      : Date.parse(event.startsAt) >= nowMs;
  });

  return [...inScope]
    .sort((a, b) => compareEventsForList(a, b, priorityOf))
    .slice(0, limit);
}
