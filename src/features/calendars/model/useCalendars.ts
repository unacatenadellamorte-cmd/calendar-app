import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnline } from '@/app/online-context';
import {
  createCalendar,
  deleteCalendar,
  ensureShiftCalendar,
  listCalendars,
  recolorCalendar,
  renameCalendar,
  restoreCalendar,
  setCalendarVisible,
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

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setErrorKey(null);
    const ensured = await ensureShiftCalendar();
    if (!ensured.ok) {
      setErrorKey(ensured.error.messageKey);
      setLoading(false);
      return;
    }
    const list = await listCalendars();
    if (list.ok) {
      setCalendars(list.value);
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
      setCalendars((cs) => [...cs, result.value]);
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    const result = await renameCalendar(id, name);
    if (result.ok) {
      setCalendars((cs) => cs.map((c) => (c.id === id ? result.value : c)));
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const recolor = useCallback(async (id: string, color: string) => {
    const result = await recolorCalendar(id, color);
    if (result.ok) {
      setCalendars((cs) => cs.map((c) => (c.id === id ? result.value : c)));
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const toggleVisible = useCallback(async (calendar: Calendar) => {
    const next = !calendar.isVisible;
    setCalendars((cs) =>
      cs.map((c) => (c.id === calendar.id ? { ...c, isVisible: next } : c)),
    );
    const result = await setCalendarVisible(calendar.id, next);
    if (!result.ok) {
      setCalendars((cs) =>
        cs.map((c) => (c.id === calendar.id ? { ...c, isVisible: calendar.isVisible } : c)),
      );
      setErrorKey(result.error.messageKey);
    }
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
      setCalendars((cs) => cs.filter((c) => c.id !== calendar.id));
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
      setCalendars((cs) =>
        [...cs, pending.calendar].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
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
    remove,
    undoDelete,
    dismissError,
  };
}
