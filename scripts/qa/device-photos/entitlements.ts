// 検証専用の権利fixture。製品の useEntitlements の代わりに、QAビルドだけが build.mjs の alias で読む。
// 通常の製品ビルド(vite.config.ts)からは参照されず、認証・DB・RevenueCatには一切触れない。
import { useSyncExternalStore } from 'react';

// 写真の契約の有無。既定は有効(写真表示の検証を通常どおり行うため)。
let photoEntitled = true;
const listeners = new Set<() => void>();

/** 検証画面のチェックボックスから、写真の契約の有無を切り替える。 */
export function setQaPhotoEntitlement(next: boolean): void {
  photoEntitled = next;
  listeners.forEach((listener) => listener());
}

/** 検証画面で、現在の写真の契約の有無を読む。 */
export function useQaPhotoEntitlement(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => photoEntitled,
    () => photoEntitled,
  );
}

const noop = () => {};

/** 製品の useEntitlements と同じ形を返す。写真以外の権利は検証対象外として固定する。 */
export function useEntitlements() {
  const canViewPhotos = useQaPhotoEntitlement();
  return {
    hasMultiAccount: false,
    canWrite: true,
    canViewPhotos,
    hasLegacyWrite: false,
    hasPaidPlan: canViewPhotos,
    loading: false,
    reload: noop,
    refresh: async () => null,
  };
}
