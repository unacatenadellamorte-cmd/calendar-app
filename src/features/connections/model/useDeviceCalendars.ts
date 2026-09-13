import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listDeviceCalendars,
  refreshDeviceCalendarCatalog,
  setDeviceCalendarSelected,
  type DeviceCalendarChoice,
} from '@/data/device-calendars';

interface State {
  choices: DeviceCalendarChoice[];
  /** 初回の一覧読み込み中。 */
  loading: boolean;
  /** 端末から取り直し中。 */
  refreshing: boolean;
  errorKey: string | null;
}

/**
 * 取り込むカレンダーの候補一覧とオン/オフ(Story 5.2)。`useGoogleCalendars` と同型。
 * マウント時にカタログを即描画し、続けて端末から取り直す。
 * トグルは楽観更新 + 失敗でロールバック。`connectionId` が無い(未接続)間は無効。
 */
export function useDeviceCalendars(connectionId: string | null) {
  const [state, setState] = useState<State>({
    choices: [],
    loading: connectionId !== null,
    refreshing: false,
    errorKey: null,
  });
  const pending = useRef(new Set<string>());

  const reloadCatalog = useCallback(async () => {
    if (!connectionId) return;
    const result = await listDeviceCalendars(connectionId);
    if (result.ok) setState((s) => ({ ...s, choices: result.value }));
    return result;
  }, [connectionId]);

  const refresh = useCallback(async () => {
    if (!connectionId) return;
    setState((s) => ({ ...s, refreshing: true, errorKey: null }));
    const result = await refreshDeviceCalendarCatalog(connectionId);
    if (result.ok) {
      await reloadCatalog();
      setState((s) => ({ ...s, refreshing: false }));
    } else {
      // 取り直しに失敗しても、直近のカタログは出し続ける。
      setState((s) => ({ ...s, refreshing: false, errorKey: result.error.messageKey }));
    }
  }, [connectionId, reloadCatalog]);

  useEffect(() => {
    if (!connectionId) {
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
  }, [connectionId, reloadCatalog, refresh]);

  const toggle = useCallback(
    async (externalCalendarId: string, selected: boolean) => {
      if (!connectionId) return;
      if (pending.current.has(externalCalendarId)) return;
      pending.current.add(externalCalendarId);
      setState((s) => ({
        ...s,
        errorKey: null,
        choices: s.choices.map((c) =>
          c.externalCalendarId === externalCalendarId ? { ...c, selected } : c,
        ),
      }));
      const result = await setDeviceCalendarSelected(connectionId, externalCalendarId, selected);
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
    },
    [connectionId],
  );

  return { ...state, refresh, toggle };
}
