import { useCallback, useEffect, useState } from 'react';
import { listSyncState, syncGoogleCalendarsNow } from '@/data/google-sync';

interface State {
  /** calendar_id → 直近の取り込み失敗内容(非 null のものだけ)。 */
  errorByCalendarId: Map<string, string>;
  retrying: boolean;
  /** 「再試行」自体が失敗したときの messageKey(画面上部に出す)。 */
  retryErrorKey: string | null;
}

/**
 * カレンダー管理画面の取り込み失敗表示(Story 3.4)。
 * `sync_state.last_error` を calendar_id 別に持ち、「再試行」で全カレンダー再取り込み。
 */
export function useCalendarSyncStatus(enabled: boolean) {
  const [state, setState] = useState<State>({
    errorByCalendarId: new Map(),
    retrying: false,
    retryErrorKey: null,
  });

  const reload = useCallback(async () => {
    const result = await listSyncState();
    if (!result.ok) return;
    const map = new Map<string, string>();
    for (const s of result.value) {
      if (s.calendarId && s.lastError) map.set(s.calendarId, s.lastError);
    }
    setState((prev) => ({ ...prev, errorByCalendarId: map }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ errorByCalendarId: new Map(), retrying: false, retryErrorKey: null });
      return;
    }
    void reload();
  }, [enabled, reload]);

  const retry = useCallback(async () => {
    setState((prev) => ({ ...prev, retrying: true, retryErrorKey: null }));
    const result = await syncGoogleCalendarsNow();
    if (result.ok) {
      await reload();
      setState((prev) => ({ ...prev, retrying: false }));
    } else {
      setState((prev) => ({ ...prev, retrying: false, retryErrorKey: result.error.messageKey }));
    }
  }, [reload]);

  return { ...state, retry, reload };
}
