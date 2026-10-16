import { useEffect } from 'react';
import { configurePurchases, purchasesSupported } from '@/data/purchases';
import { useAuth } from './auth-context';

/**
 * 認証状態に RevenueCat のユーザーを合わせる(CAP-1)。表示は持たない。
 *  - authenticated: appUserID = Supabase の auth.users.id で configure / ユーザー切替は logIn
 *  - guest / unavailable / deleting / deleted: 設定済みなら logOut(ゲストは購入不可)
 *  - loading: 何もしない
 * SDK が使えない環境(Web・キー未設定)では何もしない。
 */
export function PurchasesSync() {
  const { state, session } = useAuth();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!purchasesSupported()) return;
    if (state === 'authenticated' && userId) {
      void configurePurchases(userId);
    } else if (
      state === 'guest' ||
      state === 'unavailable' ||
      state === 'deleting' ||
      state === 'deleted'
    ) {
      void configurePurchases(null);
    }
  }, [state, userId]);
  return null;
}
