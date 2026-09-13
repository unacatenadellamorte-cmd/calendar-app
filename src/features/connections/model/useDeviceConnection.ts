import { useCallback, useEffect, useState } from 'react';
import { getDeviceConnection, type DeviceConnection } from '@/data/device-connections';
import { useAuth } from '@/app/auth-context';

interface DeviceConnectionState {
  /** 有効な端末カレンダー接続。未接続なら null。 */
  connection: DeviceConnection | null;
  loading: boolean;
  /** 取得に失敗したときの messageKey。 */
  errorKey: string | null;
  /** 接続状態を再取得する(接続後など)。 */
  refresh: () => void;
}

/**
 * 設定画面の端末カレンダー接続欄が使うフック(Story 5.2)。
 * `useGoogleConnection` と同型。`enabled`(Supabase 設定済み)かつ authenticated の
 * ときだけ `connections` を読む。
 */
export function useDeviceConnection(enabled = true): DeviceConnectionState {
  const { state } = useAuth();
  const active = enabled && state === 'authenticated';
  const [connection, setConnection] = useState<DeviceConnection | null>(null);
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
    void getDeviceConnection().then((result) => {
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
