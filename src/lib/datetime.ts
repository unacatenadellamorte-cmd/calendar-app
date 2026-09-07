/**
 * 時刻の変換ヘルパ。保存は UTC の ISO 文字列、入力・表示はユーザーのローカル時刻(AD-7)。
 */

/** `<input type="datetime-local">` の値(ローカル "YYYY-MM-DDTHH:mm")→ UTC ISO。 */
export function localInputToUtcIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

/** UTC ISO → `<input type="datetime-local">` の値(ローカル)。 */
export function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 今のローカル時刻を分単位に丸めた datetime-local 値。 */
export function nowLocalInput(offsetMinutes = 0): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  d.setSeconds(0, 0);
  return utcIsoToLocalInput(d.toISOString());
}

/** 今日のローカル日付("YYYY-MM-DD")。 */
export function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 時刻付き予定の表示用ラベル(例 "9/7 14:30")。 */
export function formatEventTime(startsAtIso: string): string {
  const d = new Date(startsAtIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 終日予定の表示用ラベル(例 "9/7 終日")。 */
export function formatEventDate(eventDate: string): string {
  const [, m, day] = eventDate.split('-');
  return `${Number(m)}/${Number(day)} 終日`;
}
