import { useState } from 'react';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import type { Calendar } from '@/data/calendars';
import { useCalendars } from '../model/useCalendars';
import { CalendarRow } from './CalendarRow';
import { CalendarFormSheet } from './CalendarFormSheet';

export function CalendarsScreen() {
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Calendar | null>(null);

  if (state === 'unavailable') {
    return (
      <Screen title="カレンダー管理">
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

  return (
    <Screen title="カレンダー管理">
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

      {cal.pendingDelete && (
        <p className="mb-3 flex items-center justify-between rounded-sm bg-surface-raised px-3 py-2 text-meta text-ink-secondary">
          「{cal.pendingDelete.name}」を削除しました
          <button type="button" onClick={() => void cal.undoDelete()} className="text-accent">
            取り消す
          </button>
        </p>
      )}

      {cal.loading ? (
        <p className="text-meta text-ink-secondary">読み込み中…</p>
      ) : (
        <ul className="rounded-md border border-border-hairline bg-surface-raised">
          {cal.calendars.map((c) => (
            <CalendarRow
              key={c.id}
              calendar={c}
              onEdit={openEdit}
              onToggleVisible={(x) => void cal.toggleVisible(x)}
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
