import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getSession,
  isAuthAvailable,
  onAuthStateChange,
  signInAnonymously,
  signOut as signOutRequest,
  deleteMyAccount,
} from '@/data/auth';
import { deletionSnapshot, readDeletion, subscribeDeletion, isAccountDataBlocked, startAfterDeletion } from '@/data/account-deletion-state';
import { t, useLanguage } from '@/i18n';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';

function deriveState(session: Session | null): AuthState {
  if (!session) return 'loading';
  return session.user.is_anonymous ? 'guest' : 'authenticated';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  useLanguage();
  const deletion = useSyncExternalStore(subscribeDeletion, deletionSnapshot, () => null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionFailed, setDeletionFailed] = useState(false);
  const [state, setState] = useState<AuthState>(isAuthAvailable() ? 'loading' : 'unavailable');
  const [session, setSession] = useState<Session | null>(null);
  /** 匿名サインインの多重発行を防ぐ(解決したら false に戻す)。 */
  const anonInFlight = useRef(false);

  useEffect(() => {
    if (!isAuthAvailable()) return;
    let cancelled = false;

    const applySession = (next: Session | null) => {
      if (cancelled || isAccountDataBlocked()) return;
      setSession(next);
      setState(deriveState(next));
    };

    /** セッションが無ければ匿名サインインでお試しモードに入る。 */
    const ensureGuest = async () => {
      if (anonInFlight.current || isAccountDataBlocked()) return;
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
      if (cancelled || isAccountDataBlocked()) return;
      if (current.ok && current.value) {
        applySession(current.value);
      } else {
        await ensureGuest();
      }
    })();

    const sub = onAuthStateChange((next) => {
      if (isAccountDataBlocked()) return;
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

  const runDeletion = useCallback(async (resumeOnly: boolean) => {
    setDeletionBusy(true);
    setDeletionFailed(false);
    try {
      const result = await deleteMyAccount(resumeOnly);
      setDeletionFailed(!result.ok);
      if (result.ok) setSession(null);
      return result;
    } finally { setDeletionBusy(false); }
  }, []);

  const deleteAccount = useCallback(() => runDeletion(false), [runDeletion]);
  const resumeDeletion = useCallback(async () => {
    const record = readDeletion();
    if (!record) { window.location.reload(); return; }
    if (!record.userId) { setDeletionFailed(true); return; }
    if (record.phase !== 'done') await runDeletion(true);
  }, [runDeletion]);

  useEffect(() => {
    const record = readDeletion();
    if (record?.userId && record.phase !== 'done') void resumeDeletion();
  }, [resumeDeletion]);

  const storageError = deletion !== null && !readDeletion()?.userId;

  const effectiveState: AuthState = deletion !== null ? (readDeletion()?.phase === 'done' ? 'deleted' : 'deleting') : state;

  const value = useMemo<AuthContextValue>(
    () => ({
      state: effectiveState,
      session: deletion !== null ? null : session,
      email: deletion !== null ? null : session?.user.email ?? null,
      signOut,
      deleteAccount,
    }),
    [effectiveState, deletion, session, signOut, deleteAccount],
  );

  return <AuthContext value={value}>{deletion !== null ? (
    <main className="mx-auto max-w-lg p-6" aria-live="polite">
      <h1 className="text-body font-semibold">{t(storageError ? '保存状態を確認できません' : effectiveState === 'deleted' ? 'アカウントを削除しました' : 'アカウントの削除中です')}</h1>
      {effectiveState === 'deleted' ? (
        <button className="mt-4 min-h-11" onClick={startAfterDeletion}>{t('新しく使い始める')}</button>
      ) : <>
        <p role={storageError ? 'alert' : undefined}>{t(storageError ? '端末の保存状態を読み取れないため、同期と予定表示を停止しています。削除は開始しません。' : '削除が完了するまで、この端末の同期と予定表示を停止しています。')}</p>
        {deletionFailed && !storageError && <p role="alert">{t('削除は完了していません。通信を確認して再試行してください。')}</p>}
        <button className="mt-4 min-h-11" disabled={deletionBusy} onClick={() => void resumeDeletion()}>{t(storageError ? '保存状態を再確認' : '削除を再試行')}</button>
        <p><a href="mailto:una.catena.della.morte@gmail.com">{t('再試行できない場合はサポートへ連絡')}</a></p>
      </>}
    </main>
  ) : children}</AuthContext>;
}
