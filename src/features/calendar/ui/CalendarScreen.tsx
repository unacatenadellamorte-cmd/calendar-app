import { Screen } from '@/ui/Screen';

/**
 * カレンダー(月 / 週 / リストの統合ビュー)。
 * 中身は Story 1.5 で実装する。
 */
export function CalendarScreen() {
  return (
    <Screen title="カレンダー">
      <p className="text-meta text-ink-secondary">
        月 / 週 / リストのカレンダー表示はこの画面に実装されます(Story 1.5)。
      </p>
    </Screen>
  );
}
