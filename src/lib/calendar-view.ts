/**
 * カレンダー表示のための純関数(Story 1.5)。副作用なし。
 * 日付は "YYYY-MM-DD" のローカル暦日、時刻付き予定は UTC ISO で受け取る。
 * `Date` はすべてローカル TZ で解釈する(AD-7。表示は端末ローカル)。
 *
 * 重なり・あふれの描画順は所属カレンダーの優先度順(Story 2.3)。
 * 並び規則は `@core` の `compareEventsForList` に集約し、ここは列詰め・グルーピングだけ持つ。
 */

import { compareEventsForList, type PriorityLookup } from '@core';
import type { EventItem } from '@/data/events';
import { localDateOf, localDateString, minutesIntoLocalDay } from './datetime';

/** 優先度を問わない(全カレンダー同順位)ルックアップ。 */
const NO_PRIORITY: PriorityLookup = () => 0;

/** カレンダー Map から優先度ルックアップを作る。未知の id は最下位相当。 */
export function makePriorityOf(
  calendarById: ReadonlyMap<string, { priority: number }>,
): PriorityLookup {
  return (id) => calendarById.get(id)?.priority ?? Number.MAX_SAFE_INTEGER;
}

const MIN_EVENT_MINUTES = 15;

export interface DayCell {
  /** "YYYY-MM-DD" */
  date: string;
  /** 1–31 */
  day: number;
  /** 表示対象月に属すか(前後月のはみ出し日は false) */
  inMonth: boolean;
  isToday: boolean;
}

export interface PositionedEvent {
  event: EventItem;
  /** ローカル午前0時からの開始分 */
  startMin: number;
  /** ローカル午前0時からの終了分(日跨ぎは 1440 にクランプ) */
  endMin: number;
  /** 0 起点の列インデックス */
  column: number;
  /** その重なりグループの列数 */
  columnCount: number;
}

/** "YYYY-MM-DD" を数値に分解する。 */
export function ymd(date: string): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return { year, month, day };
}

/** 暦日に日数を足した暦日。 */
export function addDays(date: string, n: number): string {
  const { year, month, day } = ymd(date);
  return localDateString(new Date(year, month - 1, day + n));
}

/** 暦日に月数を足した暦日。月末は繰り上げずクランプする(1/31 + 1ヶ月 = 2/28)。 */
export function addMonths(date: string, n: number): string {
  const { year, month, day } = ymd(date);
  const target = new Date(year, month - 1 + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return localDateString(target);
}

/** 暦日に年数を足した暦日。月日はそのまま(月末クランプ不要、2/29→非閏年は`Date`側の繰り上げに任せる)。 */
export function addYears(date: string, n: number): string {
  const { year, month, day } = ymd(date);
  return localDateString(new Date(year + n, month - 1, day));
}

/**
 * 指定年月(month は 1–12)の月グリッド。日曜始まり、必要な週数(4–6)ぶんのセル。
 * 先頭・末尾に前後月のはみ出し日を含む。
 */
export function monthGridDays(year: number, month: number, today: string): DayCell[] {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0 = 日
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks = Math.ceil((firstDow + daysInMonth) / 7);
  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(year, month - 1, 1 - firstDow + i);
    const date = localDateString(d);
    cells.push({
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1 && d.getFullYear() === year,
      isToday: date === today,
    });
  }
  return cells;
}

/**
 * `monthGridDays` が返す7列×N週のセル配列から、指定日付を含む1週(7セル)だけを抜き出す。
 * 月表示の折りたたみ(Option C)専用の純関数。`date` が `cells` に無ければ空配列を返す
 * (例: 月をまたいだ後に古い選択日が残っている場合。呼び出し側でフルグリッドへのフォールバックに使える)。
 */
export function weekRowOf(cells: DayCell[], date: string): DayCell[] {
  const index = cells.findIndex((cell) => cell.date === date);
  if (index === -1) return [];
  const rowStart = index - (index % 7);
  return cells.slice(rowStart, rowStart + 7);
}

/** 予定がローカル暦日 `date` に出現するか(単日前提。時刻付きは開始日で判定)。 */
export function eventOccursOnDate(event: EventItem, date: string): boolean {
  if (event.allDay) return event.eventDate === date;
  return event.startsAt ? localDateOf(event.startsAt) === date : false;
}

/** 同じ日の中での並び順(全カレンダー同順位版)。`@core` の並び規則の特殊化。 */
export function compareWithinDay(a: EventItem, b: EventItem): number {
  return compareEventsForList(a, b, NO_PRIORITY);
}

/**
 * 予定を出現日ごとにまとめる。各配列は `@core` の並び規則順。
 * `priorityOf` を渡すと所属カレンダーの優先度が第一キーになる(Story 2.2)。
 * 省略時は全カレンダー同順位(Story 1.5 の挙動)。
 */
export function groupEventsByDay(
  events: EventItem[],
  priorityOf: PriorityLookup = NO_PRIORITY,
): Map<string, EventItem[]> {
  const map = new Map<string, EventItem[]>();
  for (const event of events) {
    const key = event.allDay
      ? event.eventDate
      : event.startsAt
        ? localDateOf(event.startsAt)
        : null;
    if (!key) continue;
    const arr = map.get(key);
    if (arr) arr.push(event);
    else map.set(key, [event]);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => compareEventsForList(a, b, priorityOf));
  }
  return map;
}

interface TimedItem {
  event: EventItem;
  startMin: number;
  endMin: number;
}

/**
 * 時刻付き予定の重なりを列に割る。終日予定は無視する。
 * 重なりグループの検出は開始時刻順(グループ境界は時間で決まる)。
 * グループ内の列詰めだけ優先度順 ── `priorityOf` が高い予定ほど先に処理され、
 * 空いている最小の列番号(= 左端)を取る。`priorityOf` 省略時は Story 1.5 と同じ。
 */
export function layoutDayEvents(
  events: EventItem[],
  priorityOf: PriorityLookup = NO_PRIORITY,
): PositionedEvent[] {
  const timed: TimedItem[] = events
    .filter((e) => !e.allDay && e.startsAt)
    .map((e) => {
      const startMin = minutesIntoLocalDay(e.startsAt as string);
      let endMin = e.endsAt ? minutesIntoLocalDay(e.endsAt) : startMin + MIN_EVENT_MINUTES;
      if (endMin <= startMin) endMin = 1440; // 日跨ぎ or 同時刻
      return { event: e, startMin, endMin: Math.max(endMin, startMin + MIN_EVENT_MINUTES) };
    })
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        a.endMin - b.endMin ||
        a.event.title.localeCompare(b.event.title),
    );

  const result: PositionedEvent[] = [];
  let group: TimedItem[] = [];
  let groupEnd = -1;

  const flush = () => {
    if (group.length === 0) return;
    // グループ内は優先度順で貪欲に列詰め。高い優先度ほど小さい列番号を取る。
    const ordered = [...group].sort(
      (a, b) =>
        compareEventsForList(a.event, b.event, priorityOf) ||
        a.endMin - b.endMin ||
        a.event.title.localeCompare(b.event.title),
    );
    const colEnds: number[] = [];
    const columnOf = new Map<TimedItem, number>();
    for (const item of ordered) {
      let column = colEnds.findIndex((end) => end <= item.startMin);
      if (column === -1) {
        column = colEnds.length;
        colEnds.push(item.endMin);
      } else {
        colEnds[column] = item.endMin;
      }
      columnOf.set(item, column);
    }
    const columnCount = colEnds.length;
    // 出力は開始時刻順のまま(描画順の安定性)。列だけ優先度順の結果を使う。
    for (const item of group) {
      result.push({
        event: item.event,
        startMin: item.startMin,
        endMin: item.endMin,
        column: columnOf.get(item) ?? 0,
        columnCount,
      });
    }
    group = [];
    groupEnd = -1;
  };

  for (const item of timed) {
    if (group.length > 0 && item.startMin >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();
  return result;
}
