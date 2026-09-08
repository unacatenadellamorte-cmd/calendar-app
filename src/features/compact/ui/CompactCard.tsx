import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { EventListItem } from '@/features/events/ui/EventListItem';

interface CompactCardProps {
  /** `selectFeaturedEvents` の結果。既に優先度順・件数打ち切り済み。 */
  featured: EventItem[];
  calendarById: Map<string, Calendar>;
  onSelect: (event: EventItem) => void;
}

/**
 * ホームのコンパクトビュー。この後の代表予定を優先度順・低密度(1件ずつ独立した行)で出す。
 * 行の DOM 順 = 配列順 = 優先度順(スクリーンリーダーの読み上げ順もこれ)。
 * 0件のときは静かな1行(感嘆符なし)。
 */
export function CompactCard({ featured, calendarById, onSelect }: CompactCardProps) {
  if (featured.length === 0) {
    return (
      <p className="rounded-md border border-border-hairline bg-surface-raised px-4 py-4 text-body text-ink-secondary">
        この後の予定はありません
      </p>
    );
  }

  return (
    <ul
      aria-label="この後の予定"
      className="rounded-md border border-border-hairline bg-surface-raised px-3"
    >
      {featured.map((event) => (
        <EventListItem
          key={event.id}
          event={event}
          calendar={calendarById.get(event.calendarId)}
          onEdit={onSelect}
          compact
        />
      ))}
    </ul>
  );
}
