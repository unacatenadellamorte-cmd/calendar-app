import { t, useLanguage } from '@/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { useSecretMode } from '@/app/secret-mode-context';
import { resolveMessage } from '@/data/messages';
import { hideSecretEvents, type EventItem, type NewEventInput } from '@/data/events';
import {
  groupEventsByDay,
  makePriorityOf,
  monthGridDays,
  weekRowOf,
  ymd,
} from '@/lib/calendar-view';
import { isValidLocalDate, todayLocalDate } from '@/lib/datetime';
import { useCalendars } from '@/features/calendars/model/useCalendars';
import { useEvents } from '@/features/events/model/useEvents';
import { EventFormSheet, type EventSeed } from '@/features/events/ui/EventFormSheet';
import { EventDetailSheet } from '@/features/events/ui/EventDetailSheet';
import { useCalendarView } from '@/features/calendar/model/useCalendarView';
import { registerLayerBack } from '@/platform/layerBack';
import { ViewSwitcher } from './ViewSwitcher';
import { DateNav } from './DateNav';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { ListView } from './ListView';
import { YearView } from './YearView';
import { DayEventPanel } from './DayEventPanel';
import { MonthShiftTiles } from './MonthShiftTiles';
import { calculateMonthlyPay } from '@/features/pay/model/usePayEstimate';
interface CalendarScreenProps {
  /** ホームの代表予定タップ等で「この日を開く」指定(`?date=` 由来)。 */
  initialDate?: string;
  /** ディープリンク(`calendar-app://event/{id}`)由来の「この予定を開く」指定。 */
  initialEventId?: string;
  /** ウィジェットの新規作成リンク(`calendar-app://create/{date}`)由来の指定日。 */
  initialCreateDate?: string;
  /** 同じ日付のリンクを繰り返し処理するための要求識別子。 */
  initialRequestKey?: string;
}
/**
 * カレンダー画面。月 / 日(cursor当日の1日タイムライン、内部値は 'week') / リスト / 年の4ビューと日付ナビ。
 * 表示オンのカレンダーの予定だけを描画し、日セル / 空きスロットのタップで追加、
 * チップのタップで編集につなぐ。
 */
export function CalendarScreen({
  initialDate,
  initialEventId,
  initialCreateDate,
  initialRequestKey,
}: CalendarScreenProps = {}) {
  useLanguage();
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const ev = useEvents(enabled);
  const { unlocked } = useSecretMode();
  const navigate = useNavigate();
  // ロック中はシークレット予定を月・週・年・リストのどのビューからも除外する(spec-secret-mode)。
  const unlockedEvents = useMemo(
    () => hideSecretEvents(ev.events, unlocked),
    [ev.events, unlocked],
  );
  const { view, setView, cursor, visibleEvents, goPrev, goNext, goToday, jumpTo } =
    useCalendarView(unlockedEvents, cal.calendars, initialDate);
  const monthPay = useMemo(
    () => calculateMonthlyPay(unlockedEvents, cal.calendars, cursor.slice(0, 7)),
    [unlockedEvents, cal.calendars, cursor],
  );
  const today = todayLocalDate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);
  const [seed, setSeed] = useState<EventSeed | undefined>(undefined);
  // enabled が false→true になった描画では、データフックの再取得 effect がまだ
  // loading=true を反映していないことがある。create リンクをその描画で消費しないための世代待ち。
  const enabledAtRenderRef = useRef(enabled);
  const authJustResolved = enabled && !enabledAtRenderRef.current;
  const [waitingForAuthData, setWaitingForAuthData] = useState(false);
  useEffect(() => {
    if (authJustResolved) setWaitingForAuthData(true);
    enabledAtRenderRef.current = enabled;
  }, [authJustResolved, enabled]);
  // 月表示: タップした日(選択中)。折りたたみ(その週1行、Option C)+ 下のパネル表示を兼ねる。
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => {
    // 入力・詳細レイヤーが開いている間は、そのレイヤーの戻る処理を優先する。
    if (!selectedDay || view !== 'month' || sheetOpen || detailEvent) return;
    return registerLayerBack(() => setSelectedDay(null));
  }, [selectedDay, view, sheetOpen, detailEvent]);
  const calendarById = useMemo(
    () => new Map(cal.calendars.map((c) => [c.id, c])),
    [cal.calendars],
  );
  // 日ごとの予定グルーピング(優先度順)は MonthView / DayEventPanel の両方が使う派生データなので、
  // ここで一度だけ計算して props で渡す(calendarById と同じ「呼び出し元で計算」の慣習)。
  const priorityOf = useMemo(() => makePriorityOf(calendarById), [calendarById]);
  const byDay = useMemo(
    () => groupEventsByDay(visibleEvents, priorityOf),
    [visibleEvents, priorityOf],
  );
  const openCreate = (nextSeed?: EventSeed) => {
    setEditing(null);
    setSeed(nextSeed);
    setSheetOpen(true);
  };
  const openEdit = (event: EventItem) => {
    // 取り込んだ予定(source='google')は読み取り専用の詳細シート。ローカルは編集シート。
    if (event.source !== 'local') {
      setDetailEvent(event);
      return;
    }
    setEditing(event);
    setSeed(undefined);
    setSheetOpen(true);
  };
  const openMonthFromYear = (date: string) => {
    // 年ビューの日付/月見出しタップ→その日/月1日を cursor にして月ビューへ(概観から詳細への操作感を統一)。
    jumpTo(date);
    setView('month');
  };
  // 短いタップは週と当日の一覧、長押しはその日の新規入力を直接開く。
  const openDayPanel = (date: string) => {
    jumpTo(date);
    setSelectedDay(date);
  };
  const openDayCreate = (date: string) => {
    jumpTo(date);
    openCreate({ date });
  };
  // 「月表示に戻る」: 折りたたみ解除。
  const closeDayPanel = () => setSelectedDay(null);
  // 月表示の日付ダブルタップ: 折りたたみを解除し、その日を cursor にして「日」ビューへ
  // (年→月ドリルダウンと同じ jumpTo + setView の再利用。新規UIは作らない)。
  const openDayView = (date: string) => {
    setSelectedDay(null);
    jumpTo(date);
    setView('week');
  };
  // selectedDay(折りたたみ状態)の妥当性を、月送り・ビュー切替・年→月ドリルダウン等の
  // あらゆる画面状態変化のあとに一律で再評価する(個別の遷移経路をそれぞれ塞がない)。
  // 月ビューでなくなった、または selectedDay が現在の cursor の月グリッドに
  // もう含まれない(月を送った等)場合は無効とみなしクリアする。
  useEffect(() => {
    if (!selectedDay) return;
    if (view !== 'month') {
      setSelectedDay(null);
      return;
    }
    const { year, month } = ymd(cursor);
    const stillInGrid = weekRowOf(monthGridDays(year, month, today), selectedDay).length > 0;
    if (!stillInGrid) setSelectedDay(null);
  }, [view, cursor, today, selectedDay]);
  // ディープリンク(`calendar-app://event/{id}`)由来。auth 解決(enabled)・ev/cal のロード完了後に
  // 該当予定を探して openEdit を呼ぶ。見つからなければ何もしない(静かにフォールバック、AD-16)。
  // ラッチは「最後に処理した initialEventId」を保持し、値が変わったら再度処理できるようにする。
  const processedEventIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialEventId || processedEventIdRef.current === initialEventId) return;
    if (!enabled || ev.loading || cal.loading) return;
    processedEventIdRef.current = initialEventId;
    // ロック中はシークレット予定をディープリンクからも開けない(unlockedEvents で検索する、spec-secret-mode)。
    const target = unlockedEvents.find((e) => e.id === initialEventId);
    if (target) openEdit(target);
    // openEdit は毎レンダー再生成される関数だが、initialEventId/enabled/ev/cal の変化にのみ追従すればよい。
  }, [initialEventId, enabled, ev.loading, unlockedEvents, cal.loading]);
  // ウィジェットの create リンクは、認証と予定・カレンダーのロードが済んでから消費する。
  // それまではルートのクエリに残るため、冷起動直後のリンクを失わない。
  const processedCreateRequestRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialCreateDate || !isValidLocalDate(initialCreateDate)) return;
    const requestKey = initialRequestKey ?? initialCreateDate;
    if (processedCreateRequestRef.current === requestKey) return;
    if (!enabled || authJustResolved || waitingForAuthData) {
      if (waitingForAuthData && !ev.loading && !cal.loading) setWaitingForAuthData(false);
      return;
    }
    if (ev.loading || cal.loading) return;

    processedCreateRequestRef.current = requestKey;
    setDetailEvent(null);
    setSelectedDay(null);
    jumpTo(initialCreateDate);
    openCreate({ date: initialCreateDate });
    // 先に作成シートを開く要求を出し、処理済みのクエリだけ履歴から消費する。
    navigate('/calendar', { replace: true });
  }, [
    initialCreateDate,
    initialRequestKey,
    enabled,
    ev.loading,
    cal.loading,
    authJustResolved,
    waitingForAuthData,
    jumpTo,
    navigate,
  ]);
  if (state === 'unavailable') {
    return (
      <Screen title={t('カレンダー')}>
        <p className="text-body text-ink-secondary">
          {t('Supabase を設定すると、予定を作成・表示できます。')}
        </p>
      </Screen>
    );
  }
  const loading = ev.loading || cal.loading;
  return (
    <Screen
      title={t('カレンダー')}
      action={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/shifts/add')}
            className="text-meta text-accent"
          >
            {t('シフトを追加')}
          </button>
          <button type="button" onClick={() => openCreate()} className="text-meta text-accent">
            {t('予定を追加')}
          </button>
        </div>
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
        monthPayAmount={view === 'month' && !loading ? monthPay.amount : undefined}
      />

      {cal.errorKey && (
        <p
          role="alert"
          className="mb-3 flex items-center justify-between text-meta text-danger"
        >
          {resolveMessage(cal.errorKey)}
          <button type="button" onClick={cal.dismissError} className="text-accent">
            {t('閉じる')}
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
            {t('閉じる')}
          </button>
        </p>
      )}

      {ev.pendingDelete && (
        <p className="mb-3 flex items-center justify-between rounded-sm bg-surface-raised px-3 py-2 text-meta text-ink-secondary">
          {t('「{0}」を削除しました', [ev.pendingDelete.title])}
          <button type="button" onClick={() => void ev.undoDelete()} className="text-accent">
            {t('取り消す')}
          </button>
        </p>
      )}

      {loading ? (
        <p className="mt-2 text-meta text-ink-secondary">{t('読み込み中…')}</p>
      ) : view === 'month' ? (
        <>
          <MonthView
            cursor={cursor}
            byDay={byDay}
            calendarById={calendarById}
            today={today}
            onDayTap={openDayPanel}
            onDayLongPress={openDayCreate}
            onDayDoubleTap={openDayView}
            collapsedToWeekOf={selectedDay ?? undefined}
            onBackToMonth={closeDayPanel}
            onSwipeLeft={goNext}
            onSwipeRight={goPrev}
          />
          {selectedDay && (
            <DayEventPanel
              key={selectedDay}
              date={selectedDay}
              byDay={byDay}
              calendarById={calendarById}
              onEventTap={openEdit}
              onAddEvent={() => openCreate({ date: selectedDay })}
            />
          )}
          {!selectedDay && (
            <MonthShiftTiles
              date={cursor}
              calendars={cal.calendars}
              enabled={enabled}
              onCreated={ev.addLocal}
              events={visibleEvents}
              onDateChange={jumpTo}
              onRemove={ev.remove}
            />
          )}
        </>
      ) : view === 'week' ? (
        <WeekView
          cursor={cursor}
          events={visibleEvents}
          calendarById={calendarById}
          today={today}
          onSlotTap={(startLocal) => openCreate({ startLocal })}
          onEventTap={openEdit}
        />
      ) : view === 'year' ? (
        <YearView
          cursor={cursor}
          events={visibleEvents}
          calendarById={calendarById}
          today={today}
          onMonthTap={openMonthFromYear}
          onDayTap={openMonthFromYear}
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

      <EventFormSheet
        open={sheetOpen}
        editing={editing}
        seed={seed}
        calendars={cal.calendars}
        onClose={() => {
          setSheetOpen(false);
          setSelectedDay(null);
        }}
        onCreate={(input: NewEventInput) => ev.create(input)}
        onUpdate={(current, input) => ev.update(current, input)}
        onDelete={(event) => void ev.remove(event)}
        onSetReminder={(event, minutes) => ev.setReminder(event, minutes)}
      />

      <EventDetailSheet
        event={detailEvent}
        calendar={detailEvent ? calendarById.get(detailEvent.calendarId) : undefined}
        onClose={() => setDetailEvent(null)}
        onSetReminder={(event, minutes) => ev.setReminder(event, minutes)}
      />
    </Screen>
  );
}
