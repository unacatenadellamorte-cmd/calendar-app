import { useCallback, useEffect, useState } from 'react';
import { listConnections, type GoogleConnectionInfo } from '@/data/connections';
import { useAuth } from '@/app/auth-context';

interface GoogleConnectionsState {
  /** 自分のすべての Google 接続(active と suspended を含む)。 */
  connections: GoogleConnectionInfo[];
  loading: boolean;
  /** 取得に失敗したときの messageKey。 */
  errorKey: string | null;
  /** 接続状態を再取得する(コールバック完了後など)。 */
  refresh: () => void;
}

/**
 * 複数 Google 接続の一覧を取得するフック。
 * `enabled`(OAuth 設定済み)かつ authenticated のときだけ接続を読む。
 */
export function useGoogleConnections(enabled = true): GoogleConnectionsState {
  const { state } = useAuth();
  const active = enabled && state === 'authenticated';
  const [connections, setConnections] = useState<GoogleConnectionInfo[]>([]);
  const [loading, setLoading] = useState(active);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) {
      setConnections([]);
      setLoading(false);
      setErrorKey(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorKey(null);
    void listConnections().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setConnections(result.value);
      else setErrorKey(result.error.messageKey);
    });
    return () => {
      cancelled = true;
    };
  }, [active, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { connections, loading, errorKey, refresh };
}
