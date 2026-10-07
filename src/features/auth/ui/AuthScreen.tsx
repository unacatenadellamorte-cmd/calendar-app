import { t, useLanguage } from '@/i18n';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import { useAuthForm, type AuthMode } from '@/features/auth/model/useAuthForm';
/**
 * ログイン / アカウント作成画面(タブ外、設定から遷移)。
 * 匿名セッション中はサインアップが「登録(昇格)」になる。
 */
export function AuthScreen({
  initialMode,
  onSuccess,
}: {
  initialMode?: AuthMode;
  onSuccess?: () => void;
} = {}) {
  useLanguage();
  const { state } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // 認証通知でシェルが再マウントされても、通常ログインの戻り先を失わない。
    // 初回の成功先は親シェルが認証状態から決める。
    if (state === 'authenticated' && onSuccess === undefined) {
      navigate('/settings', { replace: true });
    }
  }, [state, onSuccess, navigate]);
  const isGuest = state === 'guest';
  const { form, setMode, setEmail, setPassword, changeEmail, submit } = useAuthForm({
    isGuest,
    initialMode,
    onSuccess: onSuccess ?? (() => navigate('/settings')),
  });
  if (state === 'unavailable') {
    return (
      <Screen title={t('アカウント')}>
        <p className="text-body text-ink-secondary">
          {t('ローカル開発では認証は無効です。Supabase を設定すると利用できます。')}
        </p>
      </Screen>
    );
  }
  // 確認メール待ち。登録は未完了なので設定へ戻さず、次の手順を案内する。
  if (form.pendingEmail) {
    return (
      <Screen title={t('確認メールを送信しました')}>
        <div role="status" className="mt-1 flex flex-col gap-3 text-body text-ink-primary">
          <p>
            {t('{0} に確認メールを送信しました。登録はまだ完了していません。', [
              form.pendingEmail,
            ])}
          </p>
          <p>
            {t(
              '届いたメールのリンクを開いて確認してください。複数届いている場合は最新のメールを使ってください。',
            )}
          </p>
          <p>
            {t(
              '確認が終わったらこのアプリに戻り、同じメールアドレスとパスワードでログインしてください。',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode('signin')}
          className="mt-6 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
        >
          {t('ログインへ進む')}
        </button>
        <button
          type="button"
          onClick={changeEmail}
          className="mt-4 min-h-11 text-meta text-accent"
        >
          {t('別のメールアドレスで登録する')}
        </button>
      </Screen>
    );
  }
  const isSignup = form.mode === 'signup';
  const submitLabel = isSignup
    ? isGuest
      ? t('登録する')
      : t('アカウントを作成')
    : t('ログイン');
  return (
    <Screen title={isSignup ? t('アカウントを作成') : t('ログイン')}>
      {isGuest && isSignup && (
        <p className="mt-1 mb-4 text-meta text-ink-secondary">
          {t('いまのデータはそのまま引き継がれます。')}
        </p>
      )}

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('メールアドレス')}</span>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={form.email}
            readOnly={form.submitting}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('パスワード(6文字以上)')}</span>
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={form.password}
            readOnly={form.submitting}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        {form.errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(form.errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={form.submitting}
          className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
        >
          {form.submitting ? t('処理中…') : submitLabel}
        </button>
      </form>

      <button
        type="button"
        disabled={form.submitting}
        onClick={() => setMode(isSignup ? 'signin' : 'signup')}
        className="mt-4 min-h-11 text-meta text-accent"
      >
        {isSignup ? t('アカウントを持っている場合はログイン') : t('アカウントを作成する')}
      </button>
    </Screen>
  );
}
