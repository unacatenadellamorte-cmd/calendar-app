import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';

export const isLabelColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** 取込予定には独自色を適用しない。既存の自作予定は所属カレンダーの色を使う。 */
export function eventLabelColor(
  event: Pick<EventItem, 'source' | 'labelColor'>,
  calendar?: Pick<Calendar, 'color'>,
): string {
  return event.source === 'local' && isLabelColor(event.labelColor)
    ? event.labelColor
    : calendar?.color || '#64748B';
}

/** 明るい背景でも件名を読めるよう、白と濃紺のコントラストが高い方を選ぶ。 */
export function labelTextColor(color: string): string {
  if (!isLabelColor(color)) return '#FFFFFF';
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  const darkContrast = (luminance + 0.05) / (0.009189219295824 + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);
  if (Math.max(darkContrast, whiteContrast) < 4.5) return '#000000';
  return darkContrast > whiteContrast
    ? '#111827'
    : '#FFFFFF';
}
