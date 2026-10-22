import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/app/auth-context';
import type { PurchasablePlan } from '@/data/entitlements';
import {
  getManagementUrl,
  configurePurchases,
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
  /** ストアのローカライズ済み価格。未取得のプランは購入不可。 */
  prices: PlanPriceStrings;
  preparation: { kind: 'loading' | 'ready' | 'error'; messageKey?: string };
  retry: () => Promise<void>;
  status: PurchaseStatus;
  /** 購入・復元・反映待ちの最中。 */
  busy: boolean;
  purchase: (plan: PurchasablePlan) => Promise<PurchaseResult>;
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
  const snap = useSyncExternalStore(
    subscribePurchases,
    getPurchasesSnapshot,
    getPurchasesSnapshot,
  );
  const supported = purchasesSupported();
  const userId = session?.user.id ?? null;
  const authenticated = state === 'authenticated';
  const available = supported && authenticated && userId !== null && snap.userId === userId;
  const loginRequired = supported && state === 'guest';

  const [prices, setPrices] = useState<PlanPriceStrings>({});
  const [priceUserId, setPriceUserId] = useState<string | null>(null);
  const [priceState, setPriceState] = useState<{
    kind: 'loading' | 'ready' | 'error';
    messageKey?: string;
  }>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<PurchaseStatus>({ kind: 'idle' });
  const mounted = useRef(true);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const busyRef = useRef(false);
  const identity = authenticated ? userId : null;
  const identityRef = useRef(identity);
  const identityGeneration = useRef(0);
  if (identityRef.current !== identity) {
    identityRef.current = identity;
    identityGeneration.current += 1;
  }
  const generation = identityGeneration.current;
  const current = useCallback(
    () =>
      mounted.current &&
      identity !== null &&
      identityRef.current === identity &&
      identityGeneration.current === generation,
    [identity, generation],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setStatus({ kind: 'idle' });
  }, [identity]);

  useEffect(() => {
    setPrices({});
    setPriceUserId(null);
    setPriceState({ kind: 'loading' });
    if (!available) {
      return;
    }
    let cancelled = false;
    void getPlanPrices().then((result) => {
      if (!cancelled && current()) {
        setPrices(result.ok ? result.value : {});
        setPriceUserId(userId);
        setPriceState(
          result.ok
            ? { kind: 'ready' }
            : { kind: 'error', messageKey: result.error.messageKey },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [available, userId, nonce, current]);

  const retry = useCallback(async () => {
    if (!supported || !current() || busyRef.current) return;
    setPrices({});
    setPriceUserId(null);
    setPriceState({ kind: 'loading' });
    if (!available) await configurePurchases(userId);
    if (current()) setNonce((n) => n + 1);
  }, [supported, current, available, userId]);

  const update = useCallback(
    (next: PurchaseStatus) => {
      if (current()) setStatus(next);
    },
    [current],
  );

  /** 目的の権利が DB に現れるまで待つ。閉じた後も続け、他の画面の表示も更新する。 */
  const waitForEntitlement = useCallback(
    async (
      isDone: (e: Pick<EntitlementsState, 'hasMultiAccount' | 'canViewPhotos' | 'hasPaidPlan'>) => boolean,
    ) => {
      update({ kind: 'syncing' });
      for (let i = 0; i < ENTITLEMENT_POLL_MAX_ATTEMPTS; i += 1) {
        await sleep(ENTITLEMENT_POLL_INTERVAL_MS);
        if (!current()) return 'cancelled' as const;
        const latest = await refreshRef.current();
        if (!current()) return 'cancelled' as const;
        if (latest && isDone(latest)) {
          update({ kind: 'settled' });
          return 'settled' as const;
        }
      }
      update({ kind: 'timeout' });
      return 'timeout' as const;
    },
    [update, current],
  );

  const guard = useCallback((): PurchaseResult | null => {
    if (!supported) return { ok: false, reason: 'not-ready' };
    if (!authenticated) {
      update({ kind: 'error', messageKey: 'purchase/login-required' });
      return { ok: false, reason: 'login-required' };
    }
    if (!available || !current()) {
      update({ kind: 'error', messageKey: 'purchase/unavailable' });
      return { ok: false, reason: 'not-ready' };
    }
    return null;
  }, [supported, authenticated, available, update, current]);

  const purchase = useCallback(
    async (plan: PurchasablePlan): Promise<PurchaseResult> => {
      const blocked = guard();
      if (blocked) return blocked;
      if (priceUserId !== userId || !prices[plan] || priceState.kind !== 'ready') {
        update({ kind: 'error', messageKey: 'purchase/product-missing' });
        return { ok: false, reason: 'not-ready' };
      }
      if (busyRef.current) return { ok: false, reason: 'not-ready' };
      busyRef.current = true;
      try {
        update({ kind: 'working', action: 'purchase' });
        const result = await purchasePlan(plan, userId);
        if (!current()) return { ok: false, reason: 'not-ready' };
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
          plan === 'multi_account' ? e.hasMultiAccount : e.canViewPhotos,
        );
        return { ok: true, outcome };
      } finally {
        busyRef.current = false;
      }
    },
    [guard, update, waitForEntitlement, prices, priceUserId, priceState.kind, userId, current],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    const blocked = guard();
    if (blocked) return blocked;
    if (busyRef.current) return { ok: false, reason: 'not-ready' };
    busyRef.current = true;
    try {
      update({ kind: 'working', action: 'restore' });
      const result = await restorePurchases();
      if (!current()) return { ok: false, reason: 'not-ready' };
      if (!result.ok) {
        update({ kind: 'error', messageKey: result.error.messageKey });
        return { ok: false, reason: 'error' };
      }
      if (!result.value.hasActiveSubscription) {
        update({ kind: 'nothing-to-restore' });
        return { ok: true, outcome: 'settled' };
      }
      const outcome = await waitForEntitlement((e) =>
        result.value.hasMultiAccountSubscription ? e.hasMultiAccount : e.hasPaidPlan,
      );
      return { ok: true, outcome };
    } finally {
      busyRef.current = false;
    }
  }, [guard, update, waitForEntitlement, current]);

  const openManagement = useCallback(async () => {
    if (guard() || busyRef.current) return;
    busyRef.current = true;
    try {
      update({ kind: 'working', action: 'manage' });
      const result = await getManagementUrl();
      if (!current()) return;
      if (!result.ok) {
        update({ kind: 'error', messageKey: result.error.messageKey });
        return;
      }
      if (!result.value) {
        update({ kind: 'no-management-url' });
        return;
      }
      const opened = await openExternalUrl(result.value);
      update(
        opened
          ? { kind: 'idle' }
          : { kind: 'error', messageKey: 'purchase/management-failed' },
      );
    } finally {
      busyRef.current = false;
    }
  }, [guard, update, current]);

  const busy = status.kind === 'working' || status.kind === 'syncing';
  const preparation = !available
    ? snap.status === 'error'
      ? { kind: 'error' as const, messageKey: snap.messageKey }
      : { kind: 'loading' as const }
    : priceUserId !== userId
      ? { kind: 'loading' as const }
      : priceState;
  return {
    supported,
    available,
    loginRequired,
    prices: priceUserId === userId ? prices : {},
    preparation,
    retry,
    status,
    busy,
    purchase,
    restore,
    openManagement,
  };
}
