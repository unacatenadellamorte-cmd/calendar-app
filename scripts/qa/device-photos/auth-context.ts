// 検証専用の認証fixture。製品の src/app/auth-context.ts の代わりに、QAビルドだけが build.mjs の alias で読む。
// Supabase 未設定相当(state: 'unavailable')に固定し、認証・DB・RevenueCatには一切触れない。
// QAの写真画面には AuthProvider が無いため、PlanSheet 経由の usePurchase がここを読んでも例外にならない。
import { createContext, useContext } from 'react';
import type { AuthContextValue } from '@/app/auth-context';
import { ok } from '@/data/result';

export const AuthContext = createContext<AuthContextValue | null>(null);

const value: AuthContextValue = {
  state: 'unavailable',
  session: null,
  email: null,
  signOut: async () => ok(undefined),
  deleteAccount: async () => ok(undefined),
};

/** 製品の useAuth と同じ形を返す。常に未設定相当で、購入・API呼び出しは行われない。 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? value;
}
