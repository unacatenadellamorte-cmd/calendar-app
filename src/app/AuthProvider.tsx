import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getSession,
  isAuthAvailable,
  onAuthStateChange,
  signInAnonymously,
  signOut as signOutRequest,
} from '@/data/auth';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';

function deriveState(session: Session | null): AuthState {
  if (!session) return 'loading';
  return session.user.is_anonymous ? 'guest' : 'authenticated';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(isAuthAvailable() ? 'loading' : 'unavailable');
  const [session, setSession] = useState<Session | null>(null);
  /** 匿名サインインの多重発行を防ぐ(解決したら false に戻す)。 */
  const anonInFlight = useRef(false);

  useEffect(() => {
    if (!isAuthAvailable()) return;
    let cancelled = false;

    const applySession = (next: Session | null) => {
      if (cancelled) return;
      setSession(next);
      setState(deriveState(next));
    };

    /** セッションが無ければ匿名サインインでお試しモードに入る。 */
    const ensureGuest = async () => {
      if (anonInFlight.current) return;
      anonInFlight.current = true;
      try {
        const anon = await signInAnonymously();
        if (cancelled) return;
        if (anon.ok && anon.value) {
          applySession(anon.value);
        } else {
          console.warn(
            '[calendar-app] 匿名サインインに失敗しました。認証は無効のまま続行します。',
          );
          setState('unavailable');
        }
      } finally {
        anonInFlight.current = false;
      }
    };

    void (async () => {
      const current = await getSession();
      if (cancelled) return;
      if (current.ok && current.value) {
        applySession(current.value);
      } else {
        await ensureGuest();
      }
    })();

    const sub = onAuthStateChange((next) => {
      if (next) {
        applySession(next);
      } else {
        // サインアウト等でセッションが消えたら、お試しモードに戻す。
        applySession(null);
        void ensureGuest();
      }
    });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    // onAuthStateChange ハンドラが state を更新し、匿名セッションを張り直す。
    return signOutRequest();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      session,
      email: session?.user.email ?? null,
      signOut,
    }),
    [state, session, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
