import { useEffect } from 'react';
import { configurePurchases, purchasesSupported } from '@/data/purchases';
import { useAuth } from './auth-context';

/**
 * 認証状態に RevenueCat のユーザーを合わせる(CAP-1)。表示は持たない。
 *  - authenticated: appUserID = Supabase の auth.users.id で configure / ユーザー切替は logIn
 *  - guest / unavailable: 設定済みなら logOut(ゲストは購入不可。匿名の購入者IDを作らない)
 *  - loading / deleting / deleted: 何もしない
 * SDK が使えない環境(Web・キー未設定)では何もしない。
 */
export function PurchasesSync() {
  const { state, session } = useAuth();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!purchasesSupported()) return;
    if (state === 'authenticated' && userId) {
      void configurePurchases(userId);
    } else if (state === 'guest' || state === 'unavailable') {
      void configurePurchases(null);
    }
  }, [state, userId]);
  return null;
}
