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
    errorKey: null,
  });
  const pending = useRef(new Set<string>());

  const reloadCatalog = useCallback(async () => {
    if (connectionId === null) return null;
    const result = await listConnectionCalendars(connectionId);
    if (result.ok) setState((s) => ({ ...s, choices: result.value }));
    return result;
  }, [connectionId]);

  const refresh = useCallback(async () => {
    if (connectionId === null) return;
    setState((s) => ({ ...s, refreshing: true, errorKey: null }));
    const result = await refreshGoogleCalendars(connectionId);
    if (result.ok) {
      await reloadCatalog();
      setState((s) => ({ ...s, refreshing: false }));
    } else {
      // 取り直しに失敗しても、直近のカタログは出し続ける。
      setState((s) => ({ ...s, refreshing: false, errorKey: result.error.messageKey }));
    }
  }, [connectionId, reloadCatalog]);

  useEffect(() => {
    if (!enabled) {
      setState({ choices: [], loading: false, refreshing: false, errorKey: null });
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

  const toggle = useCallback(async (externalCalendarId: string, selected: boolean) => {
    if (connectionId === null) return;
    if (pending.current.has(externalCalendarId)) return;
    pending.current.add(externalCalendarId);
    setState((s) => ({
      ...s,
      errorKey: null,
      choices: s.choices.map((c) =>
        c.externalCalendarId === externalCalendarId ? { ...c, selected } : c,
      ),
    }));
    const result = await setGoogleCalendarSelected(connectionId, externalCalendarId, selected);
    pending.current.delete(externalCalendarId);
    if (!result.ok) {
      setState((s) => ({
        ...s,
        errorKey: result.error.messageKey,
        choices: s.choices.map((c) =>
          c.externalCalendarId === externalCalendarId ? { ...c, selected: !selected } : c,
        ),
      }));
    }
  }, [connectionId]);

  return { ...state, refresh, toggle };
}
