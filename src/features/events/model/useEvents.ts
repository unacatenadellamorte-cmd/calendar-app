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
import { refreshFeaturedWidget } from '@/platform/widget';

/** フォームが返す完全な入力を、更新用の patch に変換する。 */
function inputToPatch(input: NewEventInput): EventPatch {
  const base = {
    calendarId: input.calendarId,
    title: input.title,
    note: input.note ?? null,
    isSecret: input.isSecret ?? false,
  };
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
  /** 非同期の再取得が、編集中の楽観更新を古いサーバー状態で上書きしないための世代番号。 */
  const mutationVersionRef = useRef(0);
  /** 再取得の応答時点で、楽観更新が進行中かを判定する。 */
  const pendingMutationsRef = useRef(0);
  /** 削除直後の再取得が遅延した場合に、古い予定を一時的に隠す。 */
  const deletedIdsRef = useRef(new Set<string>());
  const reload = useCallback(async () => {
    if (!enabled) return;
    const version = mutationVersionRef.current;
    const pendingAtStart = pendingMutationsRef.current;
    setLoading(true);
    setErrorKey(null);
    // 月 / 週 / リストのビューは過去〜未来を見るため全期間を読む(Story 1.5)。
    // オフライン時は data-access がキャッシュを返す(Story 1.6)。
    const result = await listEvents();
    // 削除・編集の開始後に返った古い一覧は、楽観更新を巻き戻すため適用しない。
    if (
      version === mutationVersionRef.current &&
      pendingAtStart === pendingMutationsRef.current &&
      pendingMutationsRef.current === 0
    ) {
      if (result.ok) {
        const deletedIds = deletedIdsRef.current;
        const nextEvents = result.value.filter((event) => !deletedIds.has(event.id));
        // サーバーが削除を反映したと確認できたIDは、次回以降の保護対象から外す。
        for (const id of deletedIds) {
          if (!result.value.some((event) => event.id === id)) deletedIds.delete(id);
        }
        setEvents(sortEvents(nextEvents));
      } else setErrorKey(result.error.messageKey);
    }
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
    mutationVersionRef.current += 1;
    pendingMutationsRef.current += 1;
    const result = await createEvent(input);
    if (result.ok) {
      setEvents((es) => sortEvents([...es, result.value]));
      setErrorKey(null); // 直前の失敗のエラーバナーを引きずらない
      // 代表予定が変わり得るのでウィジェットも最新化する(Story 5.6)。
      // fire-and-forget(`addLocal` と揃える。呼び出し側の他の副作用を待たせない)。
      void refreshFeaturedWidget();
      mutationVersionRef.current += 1;
      pendingMutationsRef.current -= 1;
      return true;
    }
    setErrorKey(result.error.messageKey);
    mutationVersionRef.current += 1;
    pendingMutationsRef.current -= 1;
    return false;
  }, []);

  /** 既に data 層で作成済みの予定を楽観的に一覧へ足す(quick-shift 等)。 */
  const addLocal = useCallback((added: EventItem[]) => {
    if (added.length === 0) return;
    mutationVersionRef.current += 1;
    pendingMutationsRef.current += 1;
    setEvents((es) => sortEvents([...es, ...added]));
    // 呼び出し側は結果を待たない同期関数のため、ウィジェット更新は fire-and-forget(Story 5.6)。
    void refreshFeaturedWidget();
    pendingMutationsRef.current -= 1;
  }, []);

  const update = useCallback(async (current: EventItem, input: NewEventInput) => {
    mutationVersionRef.current += 1;
    pendingMutationsRef.current += 1;
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
      // 代表予定が変わり得るのでウィジェットも最新化する(Story 5.6)。fire-and-forget。
      void refreshFeaturedWidget();
      mutationVersionRef.current += 1;
      pendingMutationsRef.current -= 1;
      return true;
    }
    setEvents((es) => sortEvents(es.map((e) => (e.id === current.id ? current : e))));
    setErrorKey(result.error.messageKey);
    mutationVersionRef.current += 1;
    pendingMutationsRef.current -= 1;
    return false;
  }, []);

  const finalize = useCallback(() => {
    pendingRef.current = null;
    setPendingDelete(null);
  }, []);

  const remove = useCallback(
    async (event: EventItem) => {
      mutationVersionRef.current += 1;
      pendingMutationsRef.current += 1;
      deletedIdsRef.current.add(event.id);
      setEvents((es) => es.filter((e) => e.id !== event.id));
      const result = await deleteEvent(event);
      if (!result.ok) {
        deletedIdsRef.current.delete(event.id);
        // 並行して追加・削除された予定を巻き戻さず、対象予定だけ復元する。
        setEvents((es) =>
          sortEvents(
            es.some((item) => item.id === event.id)
              ? es.map((item) => (item.id === event.id ? event : item))
              : [...es, event],
          ),
        );
        setErrorKey(result.error.messageKey);
        mutationVersionRef.current += 1;
        pendingMutationsRef.current -= 1;
        return;
      }
      // リマインダー未設定でも cancel は無害(Story 5.4)。同じ導出IDで取り消す。
      try {
        await cancelReminder(deriveNotificationId(event.id));
      } catch (e) {
        console.warn('useEvents: cancelReminder failed', (e as Error)?.message);
      }
      // 代表予定が変わり得るのでウィジェットも最新化する(Story 5.6)。fire-and-forget
      // (Undo バナー表示〈setPendingDelete〉を待たせない)。
      void refreshFeaturedWidget();
      // 直前の削除の Undo タイマが残っていたら止める(連続削除で孤児タイマが
      // 発火して次の Undo バーを早期に消すのを防ぐ。useShiftTemplates と揃える)。
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      const timer = setTimeout(finalize, UNDO_MS);
      pendingRef.current = { event, timer };
      setPendingDelete(event);
      mutationVersionRef.current += 1;
      pendingMutationsRef.current -= 1;
    },
    [finalize],
  );

  /** リマインダーを設定/解除する(Story 5.4)。source を問わず許可(FR20)。 */
  const setReminder = useCallback(async (event: EventItem, minutes: number | null) => {
    mutationVersionRef.current += 1;
    pendingMutationsRef.current += 1;
    const result = await setEventReminder(event.id, minutes);
    if (!result.ok) {
      setErrorKey(result.error.messageKey);
      mutationVersionRef.current += 1;
      pendingMutationsRef.current -= 1;
      return false;
    }
    setEvents((es) => sortEvents(es.map((e) => (e.id === event.id ? result.value : e))));
    setErrorKey(null);
    await syncReminderForEvent(result.value);
    mutationVersionRef.current += 1;
    pendingMutationsRef.current -= 1;
    return true;
  }, []);

  const undoDelete = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    mutationVersionRef.current += 1;
    pendingMutationsRef.current += 1;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    const result = await restoreEvent(pending.event);
    if (result.ok) {
      deletedIdsRef.current.delete(pending.event.id);
      setEvents((es) => sortEvents([...es, pending.event]));
      // 削除時に cancel した通知を、Undo で復元した予定に合わせて再スケジュールする(Story 5.4)。
      await syncReminderForEvent(pending.event);
      // 代表予定が変わり得るのでウィジェットも最新化する(Story 5.6)。fire-and-forget。
      void refreshFeaturedWidget();
    } else {
      setErrorKey(result.error.messageKey);
    }
    mutationVersionRef.current += 1;
    pendingMutationsRef.current -= 1;
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
