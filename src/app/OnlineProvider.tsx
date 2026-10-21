import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { isAccountDataBlocked } from '@/data/account-deletion-state';
import { flushOutbox } from '@/data/sync';
import { outboxCount, subscribeOutbox } from '@/data/outbox';
import { resolveMessage } from '@/data/messages';
import { OnlineContext, defaultOnlineState, type OnlineState } from './online-context';

/**
 * オンライン状態を配信し、オフライン→オンラインで outbox をフラッシュする(AD-9)。
 */
export function OnlineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(defaultOnlineState.online);
  const [syncNonce, setSyncNonce] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const runningRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const scheduleRetryRef = useRef<((immediate?: boolean) => void) | null>(null);
  const foregroundRef = useRef(
    typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  // 破棄された画面の非同期処理が、後から状態を更新しないようにする。
  const generationRef = useRef(0);

  const refreshPending = useCallback(async (): Promise<number | null> => {
    const generation = generationRef.current;
    try {
      const count = await outboxCount();
      if (generation === generationRef.current) setPendingCount(count);
      return count;
    } catch {
      // IndexedDB が使えない環境では未送信件数は 0 のまま。
      return null;
    }
  }, []);

  const runFlush = useCallback(async () => {
    const generation = generationRef.current;
    if (
      runningRef.current ||
      isAccountDataBlocked() ||
      !foregroundRef.current ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    ) return;
    // 件数取得のawait前にロックし、同時に届いたoutbox通知から多重flushしない。
    runningRef.current = true;
    try {
      const pending = await outboxCount();
      if (generation !== generationRef.current) return;
      setPendingCount(pending);
      if (pending === 0 || isAccountDataBlocked() || !foregroundRef.current) return;
      setFlushing(true);
      const result = await flushOutbox();
      if (generation !== generationRef.current) return;
      if (result.dropped > 0) setSyncNotice(resolveMessage('sync/partial'));
      const remaining = await refreshPending();
      if (generation !== generationRef.current) return;
      if (result.flushed > 0) setSyncNonce((n) => n + 1);
      if (remaining && foregroundRef.current) {
        scheduleRetryRef.current?.(result.interrupted ? false : true);
      } else if (!result.interrupted) {
        retryAttemptRef.current = 0;
      }
    } catch {
      // ネットワーク障害など。オンライン中も段階的に再試行する。
      if (foregroundRef.current) scheduleRetryRef.current?.();
    } finally {
      if (generation === generationRef.current) setFlushing(false);
      runningRef.current = false;
    }
  }, [refreshPending]);

  const scheduleRetry = useCallback((immediate = false) => {
    if (retryTimerRef.current || typeof navigator !== 'undefined' && !navigator.onLine) return;
    const delays = [250, 1000, 5000, 15000, 30000];
    const delay = immediate ? 0 : delays[Math.min(retryAttemptRef.current, delays.length - 1)]!;
    if (!immediate) retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void runFlush();
    }, delay);
  }, [runFlush]);
  scheduleRetryRef.current = scheduleRetry;

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      retryAttemptRef.current = 0;
      void runFlush();
    };
    const goOffline = () => {
      setOnline(false);
      void refreshPending();
    };
    const onVisibilityChange = () => {
      foregroundRef.current = document.visibilityState === 'visible';
      if (foregroundRef.current) void runFlush();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refreshPending();
    const unsubscribeOutbox =
      typeof subscribeOutbox === 'function'
        ? subscribeOutbox(() => {
            void refreshPending();
            scheduleRetryRef.current?.(true);
          })
        : () => {};
    // 起動時にオンラインなら、前回の取りこぼしを流す。
    if (typeof navigator !== 'undefined' && navigator.onLine) void runFlush();
    return () => {
      generationRef.current += 1;
      unsubscribeOutbox();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [runFlush, refreshPending]);

  const refetch = useCallback(() => setSyncNonce((n) => n + 1), []);
  const retryPending = useCallback(() => {
    retryAttemptRef.current = 0;
    scheduleRetryRef.current?.(true);
  }, []);

  const value: OnlineState = {
    online,
    syncNonce,
    pendingCount,
    flushing,
    syncNotice,
    dismissSyncNotice: () => setSyncNotice(null),
    refetch,
    retryPending,
  };

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}
