import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnline } from '@/app/online-context';
import {
  createEvent,
  deleteEvent,
  listEvents,
  restoreEvent,
  setEventReminder,
  updateEvent,
  type EventItem,
  type EventPatch,
  type NewEventInput,
} from '@/data/events';
import { deriveNotificationId } from '@core';
import { cancelReminder } from '@/platform/reminders';
import { syncReminderForEvent } from '@/data/reminders';

/** フォームが返す完全な入力を、更新用の patch に変換する。 */
function inputToPatch(input: NewEventInput): EventPatch {
  const base = { calendarId: input.calendarId, title: input.title, note: input.note ?? null };
  return input.allDay
    ? { ...base, allDay: true, eventDate: input.eventDate, startsAt: null, endsAt: null }
    : {
        ...base,
        allDay: false,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        eventDate: null,
      };
}

const UNDO_MS = 6000;

function sortEvents(events: EventItem[]): EventItem[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? 1 : -1;
    const ak = a.startsAt ?? a.eventDate ?? '';
    const bk = b.startsAt ?? b.eventDate ?? '';
    return ak.localeCompare(bk);
  });
}

export function useEvents(enabled: boolean) {
  const { syncNonce } = useOnline();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventItem | null>(null);
  const pendingRef = useRef<{ event: EventItem; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );
  /** ロールバック用に現在のリストを常に保持する。 */
  const eventsRef = useRef<EventItem[]>([]);
  eventsRef.current = events;

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setErrorKey(null);
    // 月 / 週 / リストのビューは過去〜未来を見るため全期間を読む(Story 1.5)。
    // オフライン時は data-access がキャッシュを返す(Story 1.6)。
    const result = await listEvents();
    if (result.ok) setEvents(sortEvents(result.value));
    else setErrorKey(result.error.messageKey);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // オンライン復帰でフラッシュされたら、実データを取り直す。
  useEffect(() => {
    if (syncNonce > 0) void reload();
  }, [syncNonce, reload]);

  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    },
    [],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  const create = useCallback(async (input: NewEventInput) => {
    const result = await createEvent(input);
    if (result.ok) {
      setEvents((es) => sortEvents([...es, result.value]));
      setErrorKey(null); // 直前の失敗のエラーバナーを引きずらない
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  /** 既に data 層で作成済みの予定を楽観的に一覧へ足す(quick-shift 等)。 */
  const addLocal = useCallback((added: EventItem[]) => {
    if (added.length === 0) return;
    setEvents((es) => sortEvents([...es, ...added]));
  }, []);

  const update = useCallback(async (current: EventItem, input: NewEventInput) => {
    const patch = inputToPatch(input);
    const optimistic = { ...current, ...patch } as EventItem;
    setEvents((es) => sortEvents(es.map((e) => (e.id === current.id ? optimistic : e))));
    const result = await updateEvent(current, patch);
    if (result.ok) {
      setEvents((es) => sortEvents(es.map((e) => (e.id === current.id ? result.value : e))));
      setErrorKey(null);
      // 時刻編集でリマインダーが設定済みなら、同じ導出IDで cancel → 新時刻で再スケジュール
      // (Story 5.4)。reminderMinutes が無ければ syncReminderForEvent 内で cancel のみ。
      await syncReminderForEvent(result.value);
      return true;
    }
    setEvents((es) => sortEvents(es.map((e) => (e.id === current.id ? current : e))));
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const finalize = useCallback(() => {
    pendingRef.current = null;
    setPendingDelete(null);
  }, []);

  const remove = useCallback(
    async (event: EventItem) => {
      const snapshot = eventsRef.current;
      setEvents((es) => es.filter((e) => e.id !== event.id));
      const result = await deleteEvent(event);
      if (!result.ok) {
        setEvents(sortEvents(snapshot));
        setErrorKey(result.error.messageKey);
        return;
      }
      // リマインダー未設定でも cancel は無害(Story 5.4)。同じ導出IDで取り消す。
      try {
        await cancelReminder(deriveNotificationId(event.id));
      } catch (e) {
        console.warn('useEvents: cancelReminder failed', (e as Error)?.message);
      }
      // 直前の削除の Undo タイマが残っていたら止める(連続削除で孤児タイマが
      // 発火して次の Undo バーを早期に消すのを防ぐ。useShiftTemplates と揃える)。
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      const timer = setTimeout(finalize, UNDO_MS);
      pendingRef.current = { event, timer };
      setPendingDelete(event);
    },
    [finalize],
  );

  /** リマインダーを設定/解除する(Story 5.4)。source を問わず許可(FR20)。 */
  const setReminder = useCallback(async (event: EventItem, minutes: number | null) => {
    const result = await setEventReminder(event.id, minutes);
    if (!result.ok) {
      setErrorKey(result.error.messageKey);
      return false;
    }
    setEvents((es) => sortEvents(es.map((e) => (e.id === event.id ? result.value : e))));
    setErrorKey(null);
    await syncReminderForEvent(result.value);
    return true;
  }, []);

  const undoDelete = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    const result = await restoreEvent(pending.event);
    if (result.ok) {
      setEvents((es) => sortEvents([...es, pending.event]));
      // 削除時に cancel した通知を、Undo で復元した予定に合わせて再スケジュールする(Story 5.4)。
      await syncReminderForEvent(pending.event);
    } else {
      setErrorKey(result.error.messageKey);
    }
  }, []);

  return {
    events,
    loading,
    errorKey,
    pendingDelete,
    reload,
    create,
    addLocal,
    update,
    remove,
    setReminder,
    undoDelete,
    dismissError,
  };
}
