import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnline } from '@/app/online-context';
import { refreshFeaturedWidget } from '@/platform/widget';
import {
  createCalendar,
  deleteCalendar,
  ensureShiftCalendar,
  listCalendars,
  recolorCalendar,
  renameCalendar,
  reorderCalendars,
  restoreCalendar,
  setCalendarVisible,
  sortCalendars,
  type Calendar,
  type NewCalendarInput,
} from '@/data/calendars';

const UNDO_MS = 6000;

interface PendingDelete {
  calendar: Calendar;
  timer: ReturnType<typeof setTimeout>;
}

export function useCalendars(enabled: boolean) {
  const { syncNonce } = useOnline();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Calendar | null>(null);
  const pendingRef = useRef<PendingDelete | null>(null);
  /** ロールバック用に現在のリストを常に保持する。 */
  const calendarsRef = useRef<Calendar[]>([]);
  const reloadGeneration = useRef(0);
  const visibilityVersion = useRef(0);
  const visibilityOverrides = useRef(
    new Map<string, { value: boolean; version: number; pending: boolean }>(),
  );
  const visibilityConfirmed = useRef(new Map<string, boolean>());
  const visibilityQueues = useRef(new Map<string, Promise<void>>());
  calendarsRef.current = calendars;

  const reload = useCallback(async () => {
    if (!enabled) return;
    const generation = ++reloadGeneration.current;
    const visibilityVersionAtStart = visibilityVersion.current;
    const pendingAtStart = new Map(
      [...visibilityOverrides.current.entries()]
        .filter(([, override]) => override.pending)
        .map(([id, override]) => [id, override.version]),
    );
    setLoading(true);
    setErrorKey(null);
    const ensured = await ensureShiftCalendar();
    if (generation !== reloadGeneration.current) return;
    if (!ensured.ok) {
      setErrorKey(ensured.error.messageKey);
      setLoading(false);
      return;
    }
    const list = await listCalendars();
    if (generation !== reloadGeneration.current) return;
    if (list.ok) {
      setCalendars(
        sortCalendars(list.value).map((calendar) => {
          const override = visibilityOverrides.current.get(calendar.id);
          if (!override) return calendar;
          if (
            override.version <= visibilityVersionAtStart &&
            !override.pending &&
            pendingAtStart.get(calendar.id) !== override.version
          ) {
            visibilityOverrides.current.delete(calendar.id);
            return calendar;
          }
          return { ...calendar, isVisible: override.value };
        }),
      );
    } else {
      setErrorKey(list.error.messageKey);
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

  const create = useCallback(async (input: NewCalendarInput) => {
    const result = await createCalendar(input);
    if (result.ok) {
      void refreshFeaturedWidget();
      setCalendars((cs) => sortCalendars([...cs, result.value]));
      setErrorKey(null); // 直前の失敗のエラーバナーを引きずらない
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  /** `orderedIds` の順に並べ替える(ドラッグ / ▲▼ 双方)。楽観 → 失敗でロールバック。 */
  const reorder = useCallback(async (orderedIds: string[]) => {
    const snapshot = calendarsRef.current;
    const byId = new Map(snapshot.map((c) => [c.id, c]));
    const optimistic = orderedIds
      .map((id) => byId.get(id))
      .filter((c): c is Calendar => c !== undefined);
    if (optimistic.length !== snapshot.length) return; // id 集合が食い違う → 何もしない
    setCalendars(optimistic);
    const result = await reorderCalendars(orderedIds);
    if (result.ok) {
      void refreshFeaturedWidget();
      setCalendars(sortCalendars(result.value));
    } else {
      setCalendars(snapshot);
      setErrorKey(result.error.messageKey);
    }
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    const result = await renameCalendar(id, name);
    if (result.ok) {
      void refreshFeaturedWidget();
      setCalendars((cs) => cs.map((c) => (c.id === id ? result.value : c)));
      setErrorKey(null);
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const recolor = useCallback(async (id: string, color: string) => {
    const result = await recolorCalendar(id, color);
    if (result.ok) {
      void refreshFeaturedWidget();
      setCalendars((cs) => cs.map((c) => (c.id === id ? result.value : c)));
      setErrorKey(null);
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const toggleVisible = useCallback(async (calendar: Calendar) => {
    const current =
      visibilityOverrides.current.get(calendar.id)?.value ??
      visibilityConfirmed.current.get(calendar.id) ??
      calendarsRef.current.find((item) => item.id === calendar.id)?.isVisible ??
      calendar.isVisible;
    const next = !current;
    const version = ++visibilityVersion.current;
    visibilityOverrides.current.set(calendar.id, { value: next, version, pending: true });
    setCalendars((cs) =>
      cs.map((c) => (c.id === calendar.id ? { ...c, isVisible: next } : c)),
    );
    const previous = visibilityQueues.current.get(calendar.id) ?? Promise.resolve();
    const request = previous.then(async () => {
      const result = await setCalendarVisible(calendar.id, next);
      if (result.ok) void refreshFeaturedWidget();
      if (result.ok) visibilityConfirmed.current.set(calendar.id, next);
      const latest = visibilityOverrides.current.get(calendar.id);
      if (!latest || latest.version !== version) return;
      latest.pending = false;
      if (!result.ok) {
        const confirmed = visibilityConfirmed.current.get(calendar.id) ?? current;
        setCalendars((cs) =>
          cs.map((c) => (c.id === calendar.id ? { ...c, isVisible: confirmed } : c)),
        );
        visibilityOverrides.current.delete(calendar.id);
        setErrorKey(result.error.messageKey);
      } else {
        // confirmed は最新リクエストでなくても成功時点で更新済み。
      }
    });
    visibilityQueues.current.set(calendar.id, request.catch(() => undefined));
    await request;
  }, []);

  const finalizePendingDelete = useCallback(() => {
    pendingRef.current = null;
    setPendingDelete(null);
  }, []);

  const remove = useCallback(
    async (calendar: Calendar) => {
      const result = await deleteCalendar(calendar);
      if (!result.ok) {
        setErrorKey(result.error.messageKey);
        return;
      }
      void refreshFeaturedWidget();
      setCalendars((cs) => cs.filter((c) => c.id !== calendar.id));
      // 直前の削除の Undo タイマが残っていたら止める(連続削除で孤児タイマが
      // 発火して次の Undo バーを早期に消すのを防ぐ。useShiftTemplates と揃える)。
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      const timer = setTimeout(finalizePendingDelete, UNDO_MS);
      pendingRef.current = { calendar, timer };
      setPendingDelete(calendar);
    },
    [finalizePendingDelete],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  const undoDelete = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    const result = await restoreCalendar(pending.calendar);
    if (result.ok) {
      void refreshFeaturedWidget();
      setCalendars((cs) => sortCalendars([...cs, pending.calendar]));
    } else {
      setErrorKey(result.error.messageKey);
    }
  }, []);

  return {
    calendars,
    loading,
    errorKey,
    pendingDelete,
    reload,
    create,
    rename,
    recolor,
    toggleVisible,
    reorder,
    remove,
    undoDelete,
    dismissError,
  };
}
