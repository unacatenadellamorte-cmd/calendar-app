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
  // 破棄された画面の非同期処理が、後から状態を更新しないようにする。
  const generationRef = useRef(0);

  const refreshPending = useCallback(async () => {
    const generation = generationRef.current;
    try {
      const count = await outboxCount();
      if (generation === generationRef.current) setPendingCount(count);
    } catch {
      // IndexedDB が使えない環境では未送信件数は 0 のまま。
    }
  }, []);

  const runFlush = useCallback(async () => {
    const generation = generationRef.current;
    if (runningRef.current) return;
    // 未送信が無ければ何もしない(毎回の起動で「送信中…」が瞬く のを避ける)。
    let pending = 0;
    try {
      pending = await outboxCount();
    } catch {
      // 件数を読めない場合は送信しない。
    }
    if (generation !== generationRef.current) return;
    setPendingCount(pending);
    if (pending === 0) return;

    runningRef.current = true;
    setFlushing(true);
    try {
      const result = await flushOutbox();
      if (generation !== generationRef.current) return;
      if (result.dropped > 0) setSyncNotice(resolveMessage('sync/partial'));
      await refreshPending();
      if (generation !== generationRef.current) return;
      if (result.flushed > 0) setSyncNonce((n) => n + 1);
    } catch {
      // ネットワーク障害など。次の online イベントで再試行する。
    } finally {
      if (generation === generationRef.current) setFlushing(false);
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
      generationRef.current += 1;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [runFlush, refreshPending]);

  const refetch = useCallback(() => setSyncNonce((n) => n + 1), []);

  const value: OnlineState = {
    online,
    syncNonce,
    pendingCount,
    flushing,
    syncNotice,
    dismissSyncNotice: () => setSyncNotice(null),
    refetch,
  };

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}
