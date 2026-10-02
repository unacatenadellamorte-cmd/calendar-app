import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/app/auth-context';
import type { EntitlementName } from '@/data/entitlements';
import {
  getManagementUrl,
  getPlanPrices,
  getPurchasesSnapshot,
  purchasePlan,
  purchasesSupported,
  restorePurchases,
  subscribePurchases,
  type PlanPriceStrings,
} from '@/data/purchases';
import { openExternalUrl } from '@/platform/externalLinks';
import { useEntitlements, type EntitlementsState } from './useEntitlements';

/** 購入後、権利(DB)の反映を待つ間隔と最大回数。Webhook の到達遅延を吸収する。 */
export const ENTITLEMENT_POLL_INTERVAL_MS = 2000;
export const ENTITLEMENT_POLL_MAX_ATTEMPTS = 10;

/** 購入処理の結果(呼び出し直後の戻り値。画面表示は `status` を見る)。 */
export type PurchaseResult =
  | { ok: true; outcome: 'settled' | 'timeout' | 'cancelled' }
  | {
      ok: false;
      /**
       * not-ready: 課金基盤が使えない(Web・キー未設定)。
       * login-required: ゲスト(匿名)ユーザーは購入できない。
       * error: 購入・復元の失敗。`status` に messageKey が入る。
       */
      reason: 'not-ready' | 'login-required' | 'error';
    };

/** 画面に出す進行状態。 */
export type PurchaseStatus =
  | { kind: 'idle' }
  | { kind: 'working'; action: 'purchase' | 'restore' | 'manage' }
  /** 購入は通ったが、サーバーの権利反映を待っている(「反映中…」)。 */
  | { kind: 'syncing' }
  /** 反映待ちがタイムアウトした。 */
  | { kind: 'timeout' }
  | { kind: 'settled' }
  | { kind: 'nothing-to-restore' }
  | { kind: 'no-management-url' }
  | { kind: 'error'; messageKey: string };

export interface PurchaseApi {
  /** SDK が使える環境か(ネイティブ + 公開キーあり)。false なら UI は「準備中」。 */
  supported: boolean;
  /** 購入ボタンを押せるか(SDK 有効・ログイン済み・設定完了)。 */
  available: boolean;
  /** SDK は有効だがゲストで購入できない。 */
  loginRequired: boolean;
  /** ストアのローカライズ済み価格。無いプランは仮表示のまま。 */
  prices: PlanPriceStrings;
  status: PurchaseStatus;
  /** 購入・復元・反映待ちの最中。 */
  busy: boolean;
  purchase: (plan: EntitlementName) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
  openManagement: () => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 購入処理(CAP-1 / CAP-5)。RevenueCat SDK(`@/data/purchases`)の抽象。
 *
 * 権利の真実の源はサーバー(RevenueCat → Webhook → entitlements)。購入成功後は
 * entitlements を一定間隔で再取得し、目的の権利が見えたら「反映済み」とする。
 * クライアントの customerInfo では権利を確定しない。
 */
export function usePurchase(): PurchaseApi {
  const { state, session } = useAuth();
  const { refresh } = useEntitlements();
  const snap = useSyncExternalStore(subscribePurchases, getPurchasesSnapshot, getPurchasesSnapshot);
  const supported = purchasesSupported();
  const userId = session?.user.id ?? null;
  const authenticated = state === 'authenticated';
  const available = supported && authenticated && userId !== null && snap.userId === userId;
  const loginRequired = supported && state === 'guest';

  const [prices, setPrices] = useState<PlanPriceStrings>({});
  const [status, setStatus] = useState<PurchaseStatus>({ kind: 'idle' });
  const mounted = useRef(true);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const busyRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!available) {
      setPrices({});
      return;
    }
    let cancelled = false;
    void getPlanPrices().then((result) => {
      if (!cancelled) setPrices(result.ok ? result.value : {});
    });
    return () => {
      cancelled = true;
    };
  }, [available, userId]);

  const update = useCallback((next: PurchaseStatus) => {
    if (mounted.current) setStatus(next);
  }, []);

  /** 目的の権利が DB に現れるまで待つ。閉じた後も続け、他の画面の表示も更新する。 */
  const waitForEntitlement = useCallback(
    async (isDone: (e: Pick<EntitlementsState, 'hasMultiAccount' | 'canWrite'>) => boolean) => {
      update({ kind: 'syncing' });
      for (let i = 0; i < ENTITLEMENT_POLL_MAX_ATTEMPTS; i += 1) {
        await sleep(ENTITLEMENT_POLL_INTERVAL_MS);
        const latest = await refreshRef.current();
        if (latest && isDone(latest)) {
          update({ kind: 'settled' });
          return 'settled' as const;
        }
      }
      update({ kind: 'timeout' });
      return 'timeout' as const;
    },
    [update],
  );

  const guard = useCallback((): PurchaseResult | null => {
    if (!supported) return { ok: false, reason: 'not-ready' };
    if (!authenticated) {
      update({ kind: 'error', messageKey: 'purchase/login-required' });
      return { ok: false, reason: 'login-required' };
    }
    if (!available) {
      update({ kind: 'error', messageKey: 'purchase/unavailable' });
      return { ok: false, reason: 'not-ready' };
    }
    return null;
  }, [supported, authenticated, available, update]);

  const purchase = useCallback(
    async (plan: EntitlementName): Promise<PurchaseResult> => {
      const blocked = guard();
      if (blocked) return blocked;
      if (busyRef.current) return { ok: false, reason: 'not-ready' };
      busyRef.current = true;
      try {
        update({ kind: 'working', action: 'purchase' });
        const result = await purchasePlan(plan);
        if (!result.ok) {
          update({ kind: 'error', messageKey: result.error.messageKey });
          return { ok: false, reason: 'error' };
        }
        if (result.value === 'cancelled') {
          // キャンセルはエラー扱いにせず、静かに元の状態へ戻す。
          update({ kind: 'idle' });
          return { ok: true, outcome: 'cancelled' };
        }
        const outcome = await waitForEntitlement((e) =>
          plan === 'multi_account' ? e.hasMultiAccount : e.canWrite,
        );
        return { ok: true, outcome };
      } finally {
        busyRef.current = false;
      }
    },
    [guard, update, waitForEntitlement],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    const blocked = guard();
    if (blocked) return blocked;
    if (busyRef.current) return { ok: false, reason: 'not-ready' };
    busyRef.current = true;
    try {
      update({ kind: 'working', action: 'restore' });
      const result = await restorePurchases();
      if (!result.ok) {
        update({ kind: 'error', messageKey: result.error.messageKey });
        return { ok: false, reason: 'error' };
      }
      if (!result.value.hasActiveSubscription) {
        update({ kind: 'nothing-to-restore' });
        return { ok: true, outcome: 'settled' };
      }
      const outcome = await waitForEntitlement((e) => e.canWrite);
      return { ok: true, outcome };
    } finally {
      busyRef.current = false;
    }
  }, [guard, update, waitForEntitlement]);

  const openManagement = useCallback(async () => {
    if (!available) return;
    update({ kind: 'working', action: 'manage' });
    const result = await getManagementUrl();
    if (!result.ok) {
      update({ kind: 'error', messageKey: result.error.messageKey });
      return;
    }
    if (!result.value) {
      update({ kind: 'no-management-url' });
      return;
    }
    const opened = await openExternalUrl(result.value);
    update(opened ? { kind: 'idle' } : { kind: 'error', messageKey: 'purchase/management-failed' });
  }, [available, update]);

  const busy = status.kind === 'working' || status.kind === 'syncing';
  return { supported, available, loginRequired, prices, status, busy, purchase, restore, openManagement };
}
