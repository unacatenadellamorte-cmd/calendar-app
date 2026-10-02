import { useCallback } from 'react';
import type { EntitlementName } from '@/data/entitlements';

/** 購入処理の結果。 */
export type PurchaseResult =
  | { ok: true }
  | {
      ok: false;
      /** not-ready: 課金基盤(RevenueCat)がまだ組み込まれていない。 */
      reason: 'not-ready';
    };

export interface PurchaseApi {
  /** 購入ボタンを押せるか。課金基盤が無い間は常に false(UI は「準備中」で無効)。 */
  available: boolean;
  purchase: (plan: EntitlementName) => Promise<PurchaseResult>;
}

/**
 * 購入処理の抽象(CAP-1 / CAP-5)。
 *
 * **RevenueCat への差し替え点**: RevenueCat SDK を導入したら、ここでオファリングの
 * 取得・購入・復元を実装し、`available` を SDK の初期化状態に合わせる。購入後の権利は
 * Webhook → entitlements 経由でサーバーが確定させるので、成功後は useEntitlements を
 * 再取得する。UI(PlanSheet)はこのフックだけを見ればよい。
 *
 * 現在は課金基盤が無いため、常に「準備中」(not-ready)を返す。
 */
export function usePurchase(): PurchaseApi {
  const purchase = useCallback(
    async (_plan: EntitlementName): Promise<PurchaseResult> => ({ ok: false, reason: 'not-ready' }),
    [],
  );
  return { available: false, purchase };
}
