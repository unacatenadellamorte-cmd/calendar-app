import { useCallback, useEffect, useState } from 'react';
import { getConnection, type Connection } from '@/data/connections';
import { useAuth } from '@/app/auth-context';

interface GoogleConnectionState {
  /** 有効な Google 接続。未接続なら null。 */
  connection: Connection | null;
  loading: boolean;
  /** 取得に失敗したときの messageKey。 */
  errorKey: string | null;
  /** 接続状態を再取得する(コールバック完了後など)。 */
  refresh: () => void;
}

/**
 * 設定画面の Google 接続欄が使うフック。
 * `enabled`(OAuth 設定済み)かつ authenticated のときだけ `connections` を読む。
 */
export function useGoogleConnection(enabled = true): GoogleConnectionState {
  const { state } = useAuth();
  const active = enabled && state === 'authenticated';
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(active);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) {
      setConnection(null);
      setLoading(false);
      setErrorKey(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorKey(null);
    void getConnection().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setConnection(result.value);
      else setErrorKey(result.error.messageKey);
    });
    return () => {
      cancelled = true;
    };
  }, [active, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { connection, loading, errorKey, refresh };
}
