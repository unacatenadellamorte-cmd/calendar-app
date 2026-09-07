import { createContext, useContext } from 'react';

/**
 * オンライン/オフライン状態と、復帰時の再取得トリガ。
 * Provider は `OnlineProvider.tsx`(react-refresh のため hook / component を分離)。
 */

export interface OnlineState {
  online: boolean;
  /** オンライン復帰でフラッシュ後に増える。hooks はこれを見て reload する。 */
  syncNonce: number;
  /** 未送信の outbox 件数。 */
  pendingCount: number;
  /** 復帰直後のフラッシュ中。 */
  flushing: boolean;
  /** フラッシュで項目を破棄したときの一度きりの通知(messageKey 解決済み文言)。 */
  syncNotice: string | null;
  dismissSyncNotice: () => void;
}

export const defaultOnlineState: OnlineState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncNonce: 0,
  pendingCount: 0,
  flushing: false,
  syncNotice: null,
  dismissSyncNotice: () => {},
};

export const OnlineContext = createContext<OnlineState>(defaultOnlineState);

export function useOnline(): OnlineState {
  return useContext(OnlineContext);
}
