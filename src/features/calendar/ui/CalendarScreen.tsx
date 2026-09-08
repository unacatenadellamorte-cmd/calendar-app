import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import type { EventItem, NewEventInput } from '@/data/events';
import { createShifts } from '@/data/shifts';
import type { ShiftTemplate } from '@/data/shift-templates';
import { addDays } from '@/lib/calendar-view';
import { todayLocalDate } from '@/lib/datetime';
import { useCalendars } from '@/features/calendars/model/useCalendars';
import { useEvents } from '@/features/events/model/useEvents';
import { useShiftTemplates } from '@/features/shifts/model/useShiftTemplates';
import { EventFormSheet, type EventSeed } from '@/features/events/ui/EventFormSheet';
import { QuickShiftSheet } from '@/features/shifts/ui/QuickShiftSheet';
import { useCalendarView } from '@/features/calendar/model/useCalendarView';
import { ViewSwitcher } from './ViewSwitcher';
import { DateNav } from './DateNav';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { ListView } from './ListView';

interface CalendarScreenProps {
  /** ホームの代表予定タップ等で「この日を開く」指定(`?date=` 由来)。 */
  initialDate?: string;
}

/**
 * カレンダー画面。月 / 週(1日タイムライン)/ リストの3ビューと日付ナビ。
 * 表示オンのカレンダーの予定だけを描画し、日セル / 空きスロットのタップで追加、
 * チップのタップで編集につなぐ。
 */
export function CalendarScreen({ initialDate }: CalendarScreenProps = {}) {
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const ev = useEvents(enabled);
  const sh = useShiftTemplates(enabled);
  const navigate = useNavigate();
  const { view, setView, cursor, visibleEvents, goPrev, goNext, goToday, jumpTo } =
    useCalendarView(ev.events, cal.calendars, initialDate);
  const today = todayLocalDate();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [seed, setSeed] = useState<EventSeed | undefined>(undefined);
  const [quickDate, setQuickDate] = useState<string | null>(null);
  const [shiftErrorKey, setShiftErrorKey] = useState<string | null>(null);

  const shiftCalendar = useMemo(
    () => cal.calendars.find((c) => c.isShift),
    [cal.calendars],
  );

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

  const openCreate = (nextSeed?: EventSeed) => {
    setEditing(null);
    setSeed(nextSeed);
    setSheetOpen(true);
  };
  const openEdit = (event: EventItem) => {
    if (event.source !== 'local') return;
    setEditing(event);
    setSeed(undefined);
    setSheetOpen(true);
  };
  const openOverflow = (date: string) => {
    // 「他 N 件」→ その日を優先度順(同順は開始時刻順)で一覧できるリストビューへ。
    jumpTo(date);
    setView('list');
  };

  const openQuickShift = (date: string) => {
    setShiftErrorKey(null);
    setQuickDate(date);
  };

  const pickShiftTemplate = async (template: ShiftTemplate, dayCount: number) => {
    if (!shiftCalendar || !quickDate) return false;
    const dates = Array.from({ length: dayCount }, (_, i) => addDays(quickDate, i));
    const result = await createShifts(shiftCalendar.id, template, dates);
    if (!result.ok) {
      setShiftErrorKey(result.error.messageKey);
      return false;
    }
    ev.addLocal(result.value);
    return true;
  };

  const loading = ev.loading || cal.loading;

  return (
    <Screen
      title="カレンダー"
      action={
        <button type="button" onClick={() => openCreate()} className="text-meta text-accent">
          予定を追加
        </button>
      }
    >
      <div className="mb-3">
        <ViewSwitcher view={view} onChange={setView} />
      </div>

      <DateNav
        view={view}
        cursor={cursor}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onJump={jumpTo}
      />

      {cal.errorKey && (
        <p role="alert" className="mb-3 flex items-center justify-between text-meta text-danger">
          {resolveMessage(cal.errorKey)}
          <button type="button" onClick={cal.dismissError} className="text-accent">
            閉じる
          </button>
        </p>
      )}

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

      {loading ? (
        <p className="mt-2 text-meta text-ink-secondary">読み込み中…</p>
      ) : view === 'month' ? (
        <MonthView
          cursor={cursor}
          events={visibleEvents}
          calendarById={calendarById}
          today={today}
          onDayTap={openQuickShift}
          onEventTap={openEdit}
          onOverflowTap={openOverflow}
        />
      ) : view === 'week' ? (
        <WeekView
          cursor={cursor}
          events={visibleEvents}
          calendarById={calendarById}
          today={today}
          onSlotTap={(startLocal) => openCreate({ startLocal })}
          onEventTap={openEdit}
        />
      ) : (
        <ListView
          events={visibleEvents}
          calendarById={calendarById}
          today={today}
          scrollTo={cursor}
          onEventTap={openEdit}
        />
      )}

      <QuickShiftSheet
        open={quickDate !== null}
        date={quickDate ?? today}
        templates={sh.templates}
        shiftReady={Boolean(shiftCalendar)}
        errorKey={shiftErrorKey}
        onClose={() => setQuickDate(null)}
        onPick={pickShiftTemplate}
        onAddEvent={() => {
          const date = quickDate;
          setQuickDate(null);
          openCreate(date ? { date } : undefined);
        }}
        onCreateTemplate={() => navigate('/shift-templates')}
      />

      <EventFormSheet
        open={sheetOpen}
        editing={editing}
        seed={seed}
        calendars={cal.calendars}
        onClose={() => setSheetOpen(false)}
        onCreate={(input: NewEventInput) => ev.create(input)}
        onUpdate={(current, input) => ev.update(current, input)}
        onDelete={(event) => void ev.remove(event)}
      />
    </Screen>
  );
}
