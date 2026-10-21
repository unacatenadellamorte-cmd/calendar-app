import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listConnectionCalendars,
  refreshGoogleCalendars,
  setGoogleCalendarSelected,
  type GoogleCalendarChoice,
} from '@/data/google-calendars';

interface State {
  choices: GoogleCalendarChoice[];
  /** 初回の一覧読み込み中。 */
  loading: boolean;
  /** Google から取り直し中。 */
  refreshing: boolean;
  /** カレンダー選択を保存している件数。読取更新とは分けて扱う。 */
  pendingSelections: number;
  errorKey: string | null;
}

/**
 * 取り込むカレンダーの候補一覧とオン/オフ(Story 3.2)。
 * マウント時にカタログを即描画し、続けて Google から取り直す。
 * トグルは楽観更新 + 失敗でロールバック。
 * 複数 Google アカウント対応(CAP-3): 1つの接続(`connectionId`)単位で扱う。
 * null なら何も読まない。
 */
export function useGoogleCalendars(connectionId: string | null) {
  const enabled = connectionId !== null;
  const [state, setState] = useState<State>({
    choices: [],
    loading: enabled,
    refreshing: false,
    pendingSelections: 0,
    errorKey: null,
  });
  const pending = useRef(new Set<string>());
  const connectionVersion = useRef(0);
  const catalogGeneration = useRef(0);
  const selectionOverrides = useRef(new Map<string, boolean>());

  useEffect(() => {
    connectionVersion.current += 1;
    catalogGeneration.current += 1;
    pending.current.clear();
    selectionOverrides.current.clear();
  }, [connectionId]);

  const reloadCatalog = useCallback(async () => {
    if (connectionId === null) return null;
    const generation = ++catalogGeneration.current;
    const version = connectionVersion.current;
    const result = await listConnectionCalendars(connectionId);
    if (version !== connectionVersion.current || generation !== catalogGeneration.current) return result;
    if (result.ok) {
      const choices = result.value.map((choice) => {
        const override = selectionOverrides.current.get(choice.externalCalendarId);
        return override === undefined ? choice : { ...choice, selected: override };
      });
      setState((s) => ({ ...s, choices }));
    }
    return result;
  }, [connectionId]);

  const refresh = useCallback(async () => {
    if (connectionId === null) return;
    const version = connectionVersion.current;
    setState((s) => ({ ...s, refreshing: true, errorKey: null }));
    const result = await refreshGoogleCalendars(connectionId);
    if (version !== connectionVersion.current) return;
    if (result.ok) {
      await reloadCatalog();
      if (version !== connectionVersion.current) return;
      setState((s) => ({ ...s, refreshing: false }));
    } else {
      // 取り直しに失敗しても、直近のカタログは出し続ける。
      setState((s) => ({ ...s, refreshing: false, errorKey: result.error.messageKey }));
    }
  }, [connectionId, reloadCatalog]);

  useEffect(() => {
    if (!enabled) {
      setState({
        choices: [],
        loading: false,
        refreshing: false,
        pendingSelections: 0,
        errorKey: null,
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      await reloadCatalog();
      if (cancelled) return;
      setState((s) => ({ ...s, loading: false }));
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadCatalog, refresh]);

  const toggle = useCallback(
    async (externalCalendarId: string, selected: boolean) => {
      if (connectionId === null) return;
      if (pending.current.has(externalCalendarId)) return;
      const version = connectionVersion.current;
      const previous = state.choices.find((c) => c.externalCalendarId === externalCalendarId)?.selected ?? !selected;
      pending.current.add(externalCalendarId);
      selectionOverrides.current.set(externalCalendarId, selected);
      setState((s) => ({
        ...s,
        errorKey: null,
        pendingSelections: pending.current.size,
        choices: s.choices.map((c) =>
          c.externalCalendarId === externalCalendarId ? { ...c, selected } : c,
        ),
      }));
      const rollback = (errorKey: string) => {
        if (version !== connectionVersion.current) return;
        selectionOverrides.current.delete(externalCalendarId);
        setState((s) => ({
          ...s,
          errorKey,
          choices: s.choices.map((c) =>
            c.externalCalendarId === externalCalendarId ? { ...c, selected: previous } : c,
          ),
        }));
      };
      try {
        const result = await setGoogleCalendarSelected(
          connectionId,
          externalCalendarId,
          selected,
        );
        if (!result.ok) rollback(result.error.messageKey);
        else {
          selectionOverrides.current.delete(externalCalendarId);
          await reloadCatalog();
        }
      } catch {
        rollback('connection/calendars-failed');
      } finally {
        if (version === connectionVersion.current) {
          pending.current.delete(externalCalendarId);
          setState((s) => ({ ...s, pendingSelections: pending.current.size }));
        }
      }
    },
    [connectionId, reloadCatalog, state.choices],
  );

  return { ...state, refresh, toggle };
}
