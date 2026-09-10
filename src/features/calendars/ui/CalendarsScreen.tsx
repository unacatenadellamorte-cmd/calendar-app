import { useState } from 'react';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import type { Calendar } from '@/data/calendars';
import { useCalendarSyncStatus } from '@/features/connections/model/useCalendarSyncStatus';
import { useCalendars } from '../model/useCalendars';
import { CalendarRow } from './CalendarRow';
import { CalendarFormSheet } from './CalendarFormSheet';

export function CalendarsScreen() {
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const sync = useCalendarSyncStatus(enabled);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Calendar | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  if (state === 'unavailable') {
    return (
      <Screen title="カレンダーの並び順">
        <p className="text-body text-ink-secondary">
          Supabase を設定すると、カレンダーを作成・管理できます。
        </p>
      </Screen>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (calendar: Calendar) => {
    setEditing(calendar);
    setSheetOpen(true);
  };

  const move = (calendar: Calendar, dir: 'up' | 'down') => {
    const i = cal.calendars.findIndex((c) => c.id === calendar.id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= cal.calendars.length) return;
    const ids = cal.calendars.map((c) => c.id);
    const a = ids[i];
    const b = ids[j];
    if (a === undefined || b === undefined) return;
    ids[i] = b;
    ids[j] = a;
    void cal.reorder(ids);
  };

  const dropOn = (targetId: string) => {
    const source = draggedId;
    setDraggedId(null);
    if (!source || source === targetId) return;
    const ids = cal.calendars.map((c) => c.id).filter((id) => id !== source);
    const at = ids.indexOf(targetId);
    if (at < 0) return;
    ids.splice(at, 0, source);
    void cal.reorder(ids);
  };

  return (
    <Screen title="カレンダーの並び順">
      {cal.errorKey && (
        <p
          role="alert"
          className="mb-3 flex items-center justify-between text-meta text-danger"
        >
          {resolveMessage(cal.errorKey)}
          <button type="button" onClick={cal.dismissError} className="text-accent">
            閉じる
          </button>
        </p>
      )}

      {sync.retryErrorKey && (
        <p role="alert" className="mb-3 text-meta text-danger">
          {resolveMessage(sync.retryErrorKey)}
        </p>
      )}

      {cal.pendingDelete && (
        <p className="mb-3 flex items-center justify-between rounded-sm bg-surface-raised px-3 py-2 text-meta text-ink-secondary">
          「{cal.pendingDelete.name}」を削除しました
          <button type="button" onClick={() => void cal.undoDelete()} className="text-accent">
            取り消す
          </button>
        </p>
      )}

      <p className="mb-3 text-meta text-ink-secondary">
        上にあるカレンダーほど優先。狭い表示や重なったときに先に出ます。
      </p>

      {cal.loading ? (
        <p className="text-meta text-ink-secondary">読み込み中…</p>
      ) : (
        <ul className="rounded-md border border-border-hairline bg-surface-raised">
          {cal.calendars.map((c, i) => (
            <CalendarRow
              key={c.id}
              calendar={c}
              rank={i + 1}
              total={cal.calendars.length}
              onEdit={openEdit}
              onToggleVisible={(x) => void cal.toggleVisible(x)}
              onMove={move}
              onDragStartRow={setDraggedId}
              onDropRow={dropOn}
              dragging={draggedId === c.id}
              syncError={sync.errorByCalendarId.get(c.id) ?? null}
              onRetry={() => void sync.retry()}
              retrying={sync.retrying}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={openCreate}
        className="mt-4 min-h-11 w-full rounded-sm border border-dashed border-accent px-4 text-body text-accent"
      >
        ＋ カレンダーを作成
      </button>

      <CalendarFormSheet
        open={sheetOpen}
        editing={editing}
        usedColors={cal.calendars.map((c) => c.color)}
        onClose={() => setSheetOpen(false)}
        onSubmit={({ name, color }) =>
          editing ? handleEditSubmit(editing, name, color) : cal.create({ name, color })
        }
        onDelete={(calendar) => {
          setSheetOpen(false);
          void cal.remove(calendar);
        }}
      />
    </Screen>
  );

  async function handleEditSubmit(target: Calendar, name: string, color: string) {
    let allOk = true;
    if (name.trim() !== target.name) {
      allOk = (await cal.rename(target.id, name)) && allOk;
    }
    if (color !== target.color) {
      allOk = (await cal.recolor(target.id, color)) && allOk;
    }
    return allOk;
  }
}
