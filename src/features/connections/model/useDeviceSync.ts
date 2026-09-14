import { useCallback, useState } from 'react';
import { syncDeviceCalendarsNow, type SyncRunResult } from '@/data/device-sync';

interface State {
  syncing: boolean;
  /** 直近の「今すぐ取り込み」の結果(未実行なら null)。 */
  lastRun: SyncRunResult | null;
  errorKey: string | null;
}

/**
 * 端末カレンダーの「今すぐ取り込み」の実行(Story 5.3)。`useGoogleSync` と対の形。
 * 成功したら `onDone` を呼ぶ(呼び出し側がカレンダー・予定一覧を取り直す)。
 */
export function useDeviceSync(onDone?: () => void) {
  const [state, setState] = useState<State>({ syncing: false, lastRun: null, errorKey: null });

  const runSync = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true, errorKey: null }));
    const result = await syncDeviceCalendarsNow();
    if (result.ok) {
      setState({ syncing: false, lastRun: result.value, errorKey: null });
      onDone?.();
    } else {
      setState((s) => ({ ...s, syncing: false, errorKey: result.error.messageKey }));
    }
  }, [onDone]);

  return { ...state, runSync };
}
