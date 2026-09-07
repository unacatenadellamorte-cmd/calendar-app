import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushOutbox } from '@/data/sync';
import { outboxCount } from '@/data/outbox';
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

  const refreshPending = useCallback(async () => {
    try {
      setPendingCount(await outboxCount());
    } catch {
      // IndexedDB が使えない環境では未送信件数は 0 のまま。
    }
  }, []);

  const runFlush = useCallback(async () => {
    if (runningRef.current) return;
    // 未送信が無ければ何もしない(毎回の起動で「送信中…」が瞬く のを避ける)。
    let pending = 0;
    try {
      pending = await outboxCount();
    } catch {
      // ignore
    }
    setPendingCount(pending);
    if (pending === 0) return;

    runningRef.current = true;
    setFlushing(true);
    try {
      const result = await flushOutbox();
      if (result.dropped > 0) setSyncNotice(resolveMessage('sync/partial'));
      await refreshPending();
      if (result.flushed > 0) setSyncNonce((n) => n + 1);
    } catch {
      // ネットワーク障害など。次の online イベントで再試行する。
    } finally {
      setFlushing(false);
      runningRef.current = false;
    }
  }, [refreshPending]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void runFlush();
    };
    const goOffline = () => {
      setOnline(false);
      void refreshPending();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    void refreshPending();
    // 起動時にオンラインなら、前回の取りこぼしを流す。
    if (typeof navigator !== 'undefined' && navigator.onLine) void runFlush();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [runFlush, refreshPending]);

  const value: OnlineState = {
    online,
    syncNonce,
    pendingCount,
    flushing,
    syncNotice,
    dismissSyncNotice: () => setSyncNotice(null),
  };

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}
