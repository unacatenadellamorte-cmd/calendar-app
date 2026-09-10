import { useCallback, useState } from 'react';
import { syncGoogleCalendarsNow, type SyncRunResult } from '@/data/google-sync';

interface State {
  syncing: boolean;
  /** 直近の「今すぐ取り込み」の結果(未実行なら null)。 */
  lastRun: SyncRunResult | null;
  errorKey: string | null;
}

/**
 * 「今すぐ取り込み」の実行(Story 3.3)。
 * 成功したら `onDone` を呼ぶ(呼び出し側が sync_state / events を取り直す)。
 */
export function useGoogleSync(onDone?: () => void) {
  const [state, setState] = useState<State>({ syncing: false, lastRun: null, errorKey: null });

  const runSync = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true, errorKey: null }));
    const result = await syncGoogleCalendarsNow();
    if (result.ok) {
      setState({ syncing: false, lastRun: result.value, errorKey: null });
      onDone?.();
    } else {
      setState((s) => ({ ...s, syncing: false, errorKey: result.error.messageKey }));
    }
  }, [onDone]);

  return { ...state, runSync };
}
