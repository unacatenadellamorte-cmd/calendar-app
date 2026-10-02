import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/auth-context';
import { env } from '@/data/env';
import { isEntitlementActive, listMyEntitlements, type Entitlement } from '@/data/entitlements';

export interface EntitlementsState {
  /** 取得中。取得中は権利なしとして扱う。 */
  loading: boolean;
  /** 有効な multi_account を持つ(複数 Google アカウント)。 */
  hasMultiAccount: boolean;
  /** 予定反映を使える(calendar_write または multi_account。B は A を内包する)。 */
  canWrite: boolean;
  reload: () => void;
}

/** 権利行の一覧から表示用の判定を作る(期限切れは無効)。 */
export function deriveEntitlements(
  rows: readonly Entitlement[],
  now: number = Date.now(),
): Pick<EntitlementsState, 'hasMultiAccount' | 'canWrite'> {
  const active = new Set(rows.filter((r) => isEntitlementActive(r, now)).map((r) => r.entitlement));
  const hasMultiAccount = active.has('multi_account');
  return { hasMultiAccount, canWrite: hasMultiAccount || active.has('calendar_write') };
}

/**
 * 自分の有料機能の権利(CAP-2 / CAP-5)。
 * 未ログイン(ゲスト含む)・Supabase 未設定・取得失敗のときは「権利なし」。
 * ここでの判定は導線の出し分けにだけ使い、上限の強制はサーバー(oauth-exchange)が行う。
 */
export function useEntitlements(): EntitlementsState {
  const { state, session } = useAuth();
  const userId = session?.user.id ?? null;
  const active = env.hasSupabase && state === 'authenticated';
  const [rows, setRows] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(active);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setRows([]);
    if (!active) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listMyEntitlements().then((result) => {
      if (cancelled) return;
      setLoading(false);
      setRows(result.ok ? result.value : []);
    });
    return () => {
      cancelled = true;
    };
  }, [active, userId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // 未ログインへ切り替わった直後の描画でも、前の利用者の権利を使わない。
  return { loading, ...deriveEntitlements(active ? rows : []), reload };
}
