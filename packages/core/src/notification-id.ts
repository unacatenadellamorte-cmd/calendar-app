/**
 * ローカル通知IDの導出(Story 5.4、ARCHITECTURE-SPINE Epic5)。
 * このモジュールは何も import しない。フロント(src/platform/reminders.ts,
 * src/data/reminders.ts, src/features/events/model/useEvents.ts)は必ずこの1関数
 * だけを通して通知IDを作る ── 独自のハッシュ関数を増やさない(Boundaries & Constraints)。
 *
 * `events.id`(UUID)のハイフンを除いた先頭8桁 hex を32bit整数として parse し、
 * `| 0` で符号あり32bit整数(Capacitor LocalNotifications の `id` が要求する形)へ
 * 変換する。同じ id なら常に同じ通知IDになる(決定的)。衝突は理論上あり得るが、
 * 個人規模の予定数では許容する(spec Design Notes 参照)。
 */
export function deriveNotificationId(eventId: string): number {
  const hex = eventId.replace(/-/g, '').slice(0, 8);
  const n = parseInt(hex, 16);
  return (Number.isNaN(n) ? 0 : n) | 0;
}
