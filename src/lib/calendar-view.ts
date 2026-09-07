/**
 * カレンダー表示のための純関数(Story 1.5)。副作用なし。
 * 日付は "YYYY-MM-DD" のローカル暦日、時刻付き予定は UTC ISO で受け取る。
 * `Date` はすべてローカル TZ で解釈する(AD-7。表示は端末ローカル)。
 *
 * 重なりレイアウトの順序(開始時刻→タイトル)は Epic 2 / Story 2.3 で
 * カレンダー優先度順へ差し替える。差し替え点として `layoutDayEvents` に隔離している。
 */

import type { EventItem } from '@/data/events';
import { localDateOf, localDateString, minutesIntoLocalDay } from './datetime';

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

/** 予定がローカル暦日 `date` に出現するか(単日前提。時刻付きは開始日で判定)。 */
export function eventOccursOnDate(event: EventItem, date: string): boolean {
  if (event.allDay) return event.eventDate === date;
  return event.startsAt ? localDateOf(event.startsAt) === date : false;
}

/** 同じ日の中での並び順: 時刻付き→終日、時刻付きは開始時刻順、同時刻はタイトル順。 */
export function compareWithinDay(a: EventItem, b: EventItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? 1 : -1;
  if (a.allDay) return a.title.localeCompare(b.title);
  const am = minutesIntoLocalDay(a.startsAt as string);
  const bm = minutesIntoLocalDay(b.startsAt as string);
  return am - bm || a.title.localeCompare(b.title);
}

/** 予定を出現日ごとにまとめる。各配列は `compareWithinDay` 順。 */
export function groupEventsByDay(events: EventItem[]): Map<string, EventItem[]> {
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
  for (const arr of map.values()) arr.sort(compareWithinDay);
  return map;
}

/**
 * 時刻付き予定の重なりを列に割る。終日予定は無視する。
 * 重なりグループごとに列数を出し、グループ内の全予定にその列数を付ける。
 * 順序は開始時刻→タイトル(Story 2.3 で優先度順に差し替え)。
 */
export function layoutDayEvents(events: EventItem[]): PositionedEvent[] {
  const timed = events
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
  let group: { event: EventItem; startMin: number; endMin: number; column: number }[] = [];
  let groupEnd = -1;
  const colEnds: number[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const columnCount = colEnds.length;
    for (const item of group) result.push({ ...item, columnCount });
    group = [];
    groupEnd = -1;
    colEnds.length = 0;
  };

  for (const item of timed) {
    if (group.length > 0 && item.startMin >= groupEnd) flush();
    let column = colEnds.findIndex((end) => end <= item.startMin);
    if (column === -1) {
      column = colEnds.length;
      colEnds.push(item.endMin);
    } else {
      colEnds[column] = item.endMin;
    }
    group.push({ ...item, column });
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();
  return result;
}
