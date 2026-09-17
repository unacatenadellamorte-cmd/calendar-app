import { t, useLanguage } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import { useAuthForm } from '@/features/auth/model/useAuthForm';
/**
 * ログイン / アカウント作成画面(タブ外、設定から遷移)。
 * 匿名セッション中はサインアップが「登録(昇格)」になる。
 */
export function AuthScreen() {
  useLanguage();
  const { state } = useAuth();
  const navigate = useNavigate();
  const isGuest = state === 'guest';
  const { form, setMode, setEmail, setPassword, submit } = useAuthForm({
    isGuest,
    onSuccess: () => navigate('/settings'),
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
        onClick={() => setMode(isSignup ? 'signin' : 'signup')}
        className="mt-4 min-h-11 text-meta text-accent"
      >
        {isSignup ? t('アカウントを持っている場合はログイン') : t('アカウントを作成する')}
      </button>
    </Screen>
  );
}
