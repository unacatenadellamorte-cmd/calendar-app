import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getSession,
  isAuthAvailable,
  onAuthStateChange,
  signInAnonymously,
  signOut as signOutRequest,
  deleteMyAccount,
} from '@/data/auth';
import {
  deletionSnapshot,
  readDeletion,
  subscribeDeletion,
  isAccountDataBlocked,
  startAfterDeletion,
} from '@/data/account-deletion-state';
import { t, useLanguage } from '@/i18n';
import { firstRunKey } from '@/features/onboarding/model/first-run-state';
import {
  adoptAccountOwner,
  beginAccountTransition,
  localAccountOwner,
  reloadAccountPage,
  requireAccountOwner,
} from '@/data/account-scope';
import { clearPreviousAccountSession } from '@/data/account-session';
import { legacyOutboxCount } from '@/data/local-db';
import { appError, err, ok } from '@/data/result';
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
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [legacyPending, setLegacyPending] = useState(false);
  const switchMode = useRef<'logout' | 'reload'>('reload');
  const switchInFlight = useRef(false);

  const completeAccountSwitch = useCallback(async () => {
    if (switchInFlight.current) return err(appError('auth/unknown', 'auth/unknown'));
    switchInFlight.current = true;
    beginAccountTransition();
    setSwitching(true);
    setSwitchBusy(true);
    setSwitchFailed(false);
    try {
      await clearPreviousAccountSession();
      if (switchMode.current === 'logout') {
        const result = await signOutRequest();
        if (!result.ok) {
          setSwitchFailed(true);
          return result;
        }
      }
      reloadAccountPage();
      return ok(undefined);
    } catch (cause) {
      setSwitchFailed(true);
      return err(appError('auth/unknown', 'auth/unknown', cause));
    } finally {
      switchInFlight.current = false;
      setSwitchBusy(false);
    }
  }, []);

  useEffect(() => {
    requireAccountOwner();
    if (!isAuthAvailable()) return;
    let cancelled = false;

    const applySession = (next: Session | null) => {
      if (cancelled || isAccountDataBlocked()) return;
      const owner = localAccountOwner();
      if (owner !== null && next?.user.id !== owner) {
        switchMode.current = 'reload';
        void completeAccountSwitch();
        return;
      }
      if (next) {
        adoptAccountOwner(next.user.id);
        void legacyOutboxCount()
          .then((count) => {
            if (!cancelled) setLegacyPending(count > 0);
          })
          .catch(() => undefined);
      }
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
        // 既存の利用者が居た場合は、旧処理を止めてから再起動する。
        applySession(null);
        if (!isAccountDataBlocked()) void ensureGuest();
      }
    });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [completeAccountSwitch]);

  const signOut = useCallback(async () => {
    switchMode.current = 'logout';
    return completeAccountSwitch();
  }, [completeAccountSwitch]);

  const runDeletion = useCallback(async (resumeOnly: boolean) => {
    setDeletionBusy(true);
    setDeletionFailed(false);
    try {
      const result = await deleteMyAccount(resumeOnly);
      setDeletionFailed(!result.ok);
      if (result.ok) {
        const userId = readDeletion()?.userId;
        if (userId) {
          try {
            localStorage.removeItem(firstRunKey(userId));
          } catch {
            // 進捗だけの保存が禁止されても、完了した本人削除を失敗扱いにはしない。
          }
        }
        setSession(null);
      }
      return result;
    } finally {
      setDeletionBusy(false);
    }
  }, []);

  const deleteAccount = useCallback(() => runDeletion(false), [runDeletion]);
  const resumeDeletion = useCallback(async () => {
    const record = readDeletion();
    if (!record) {
      window.location.reload();
      return;
    }
    if (!record.userId) {
      setDeletionFailed(true);
      return;
    }
    if (record.phase !== 'done') await runDeletion(true);
  }, [runDeletion]);

  useEffect(() => {
    const record = readDeletion();
    if (record?.userId && record.phase !== 'done') void resumeDeletion();
  }, [resumeDeletion]);

  const storageError = deletion !== null && !readDeletion()?.userId;

  const effectiveState: AuthState =
    deletion !== null ? (readDeletion()?.phase === 'done' ? 'deleted' : 'deleting') : state;

  const value = useMemo<AuthContextValue>(
    () => ({
      state: effectiveState,
      session: deletion !== null ? null : session,
      email: deletion !== null ? null : (session?.user.email ?? null),
      signOut,
      deleteAccount,
    }),
    [effectiveState, deletion, session, signOut, deleteAccount],
  );

  return (
    <AuthContext value={value}>
      {deletion !== null ? (
        <main className="mx-auto max-w-lg p-6" aria-live="polite">
          <h1 className="text-body font-semibold">
            {t(
              storageError
                ? '保存状態を確認できません'
                : effectiveState === 'deleted'
                  ? 'アカウントを削除しました'
                  : 'アカウントの削除中です',
            )}
          </h1>
          {effectiveState === 'deleted' ? (
            <button className="mt-4 min-h-11" onClick={startAfterDeletion}>
              {t('新しく使い始める')}
            </button>
          ) : (
            <>
              <p role={storageError ? 'alert' : undefined}>
                {t(
                  storageError
                    ? '端末の保存状態を読み取れないため、同期と予定表示を停止しています。削除は開始しません。'
                    : '削除が完了するまで、この端末の同期と予定表示を停止しています。',
                )}
              </p>
              {deletionFailed && !storageError && (
                <p role="alert">
                  {t('削除は完了していません。通信を確認して再試行してください。')}
                </p>
              )}
              <button
                className="mt-4 min-h-11"
                disabled={deletionBusy}
                onClick={() => void resumeDeletion()}
              >
                {t(storageError ? '保存状態を再確認' : '削除を再試行')}
              </button>
              <p>
                <a href="mailto:una.catena.della.morte@gmail.com">
                  {t('再試行できない場合はサポートへ連絡')}
                </a>
              </p>
            </>
          )}
        </main>
      ) : switching ? (
        <main className="mx-auto max-w-lg p-6" aria-live="polite">
          <p>
            {t('アカウントを切り替えています。未送信の変更は元のアカウント用に保管します。')}
          </p>
          {switchFailed && (
            <p role="alert">{t('切替の後始末が完了していません。再試行してください。')}</p>
          )}
          <button disabled={switchBusy} onClick={() => void completeAccountSwitch()}>
            {t('もう一度試す')}
          </button>
        </main>
      ) : state === 'loading' ? (
        <p role="status">{t('読み込み中…')}</p>
      ) : (
        <>
          {legacyPending && (
            <p role="status">
              {t(
                '旧版の未送信データは所有者を確認できないため隔離して保管しています。別アカウントには送信しません。',
              )}
            </p>
          )}
          {children}
        </>
      )}
    </AuthContext>
  );
}
