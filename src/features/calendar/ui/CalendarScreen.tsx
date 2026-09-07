import { useMemo, useState } from 'react';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import type { EventItem, NewEventInput } from '@/data/events';
import { useCalendars } from '@/features/calendars/model/useCalendars';
import { useEvents } from '@/features/events/model/useEvents';
import { EventFormSheet } from '@/features/events/ui/EventFormSheet';
import { EventListItem } from '@/features/events/ui/EventListItem';

/**
 * カレンダー画面。月 / 週 / リストの本格ビューは Story 1.5。
 * このストーリーでは「今後の予定」の素朴な時系列リストと、予定の追加・編集。
 */
export function CalendarScreen() {
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const ev = useEvents(enabled);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);

  const calendarById = useMemo(
    () => new Map(cal.calendars.map((c) => [c.id, c])),
    [cal.calendars],
  );

  if (state === 'unavailable') {
    return (
      <Screen title="カレンダー">
        <p className="text-body text-ink-secondary">
          Supabase を設定すると、予定を作成・表示できます。
        </p>
      </Screen>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (event: EventItem) => {
    if (event.source !== 'local') return;
    setEditing(event);
    setSheetOpen(true);
  };

  return (
    <Screen
      title="カレンダー"
      action={
        <button type="button" onClick={openCreate} className="text-meta text-accent">
          予定を追加
        </button>
      }
    >
      {ev.errorKey && (
        <p
          role="alert"
          className="mb-3 flex items-center justify-between text-meta text-danger"
        >
          {resolveMessage(ev.errorKey)}
          <button type="button" onClick={ev.dismissError} className="text-accent">
            閉じる
          </button>
        </p>
      )}

      {ev.pendingDelete && (
        <p className="mb-3 flex items-center justify-between rounded-sm bg-surface-raised px-3 py-2 text-meta text-ink-secondary">
          「{ev.pendingDelete.title}」を削除しました
          <button type="button" onClick={() => void ev.undoDelete()} className="text-accent">
            取り消す
          </button>
        </p>
      )}

      <h2 className="text-meta text-ink-secondary">今後の予定</h2>

      {ev.loading ? (
        <p className="mt-2 text-meta text-ink-secondary">読み込み中…</p>
      ) : ev.events.length === 0 ? (
        <p className="mt-2 text-meta text-ink-secondary">この後の予定はありません</p>
      ) : (
        <ul className="mt-2 rounded-md border border-border-hairline bg-surface-raised px-3">
          {ev.events.map((e) => (
            <EventListItem
              key={e.id}
              event={e}
              calendar={calendarById.get(e.calendarId)}
              onEdit={openEdit}
            />
          ))}
        </ul>
      )}

      <EventFormSheet
        open={sheetOpen}
        editing={editing}
        calendars={cal.calendars}
        onClose={() => setSheetOpen(false)}
        onCreate={(input: NewEventInput) => ev.create(input)}
        onUpdate={(current, input) => ev.update(current, input)}
      />
    </Screen>
  );
}
