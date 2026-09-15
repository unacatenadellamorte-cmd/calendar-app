/**
 * 時刻の変換ヘルパ。保存は UTC の ISO 文字列、入力・表示はユーザーのローカル時刻(AD-7)。
 */

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `Date` をローカル暦日 "YYYY-MM-DD" にする。 */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `<input type="datetime-local">` の値(ローカル "YYYY-MM-DDTHH:mm")→ UTC ISO。 */
export function localInputToUtcIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

/** UTC ISO → `<input type="datetime-local">` の値(ローカル)。 */
export function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${localDateString(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 今のローカル時刻を分単位に丸めた datetime-local 値。 */
export function nowLocalInput(offsetMinutes = 0): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  d.setSeconds(0, 0);
  return utcIsoToLocalInput(d.toISOString());
}

/** datetime-local 値に分を足した datetime-local 値。 */
export function plusMinutesLocal(localValue: string, minutes: number): string {
  const d = new Date(localValue);
  d.setMinutes(d.getMinutes() + minutes);
  return utcIsoToLocalInput(d.toISOString());
}

/** 今日のローカル日付("YYYY-MM-DD")。 */
export function todayLocalDate(): string {
  return localDateString(new Date());
}

/** UTC ISO の指す瞬間が属すローカル暦日("YYYY-MM-DD")。 */
export function localDateOf(iso: string): string {
  return localDateString(new Date(iso));
}

/** UTC ISO の指す瞬間の、ローカルの午前0時からの経過分(0–1439)。 */
export function minutesIntoLocalDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** 時刻付き予定の表示用ラベル(例 "9/7 14:30")。 */
export function formatEventTime(startsAtIso: string): string {
  const d = new Date(startsAtIso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 終日予定の表示用ラベル(例 "9/7 終日")。 */
export function formatEventDate(eventDate: string): string {
  const [, m, day] = eventDate.split('-');
  return `${Number(m)}/${Number(day)} 終日`;
}

/** 時刻のみのラベル(例 "9:00" / "14:30")。日付は付けない。 */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
}

/** ローカル暦日("YYYY-MM-DD")→ "2026年9月"。 */
export function formatMonthTitle(date: string): string {
  const [y = 0, m = 0] = date.split('-').map(Number);
  return `${y}年${m}月`;
}

/** ローカル暦日("YYYY-MM-DD")→ "2026年"。 */
export function formatYearTitle(date: string): string {
  const [y = 0] = date.split('-').map(Number);
  return `${y}年`;
}

/** ローカル暦日("YYYY-MM-DD")→ "9月6日(日)"。 */
export function formatDayTitle(date: string): string {
  const [, m = 0, d = 0] = date.split('-').map(Number);
  const wd = WEEKDAY_JA[new Date(`${date}T00:00`).getDay()] ?? '';
  return `${m}月${d}日(${wd})`;
}
