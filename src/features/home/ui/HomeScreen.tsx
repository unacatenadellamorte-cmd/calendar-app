import { Link } from 'react-router-dom';
import { Screen } from '@/ui/Screen';

/**
 * ホーム(コンパクトビュー + 給料見込み)。
 * 中身は Epic 2(代表予定)/ Epic 4(給料見込み)で実装する。
 */
export function HomeScreen() {
  return (
    <Screen
      title="今日"
      action={
        <span className="flex gap-3">
          <Link to="/calendar" className="text-meta text-accent">
            予定を追加
          </Link>
          <Link to="/calendars" className="text-meta text-accent">
            カレンダー管理 ›
          </Link>
        </span>
      }
    >
      <p className="text-meta text-ink-secondary">
        代表予定と給料見込みはこの画面に表示されます(後続ストーリーで実装)。
      </p>
    </Screen>
  );
}
