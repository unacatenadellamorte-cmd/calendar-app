import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Result } from '@/data/result';

/**
 * 認証状態:
 *  - loading:        初期化中
 *  - guest:          匿名セッション(実 auth.uid あり。RLS は効く)
 *  - authenticated:  メールアカウントのセッション
 *  - unavailable:    Supabase 未設定(ローカル開発)
 */
export type AuthState = 'loading' | 'guest' | 'authenticated' | 'unavailable';

export interface AuthContextValue {
  state: AuthState;
  session: Session | null;
  /** ログイン済みユーザーのメール(匿名 / 未設定なら null)。 */
  email: string | null;
  signOut: () => Promise<Result<void>>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth は <AuthProvider> の内側で使ってください');
  }
  return ctx;
}
