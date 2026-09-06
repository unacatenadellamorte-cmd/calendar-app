import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { authMessage } from '@/data/auth.errors';
import { useAuthForm } from '@/features/auth/model/useAuthForm';

/**
 * ログイン / アカウント作成画面(タブ外、設定から遷移)。
 * 匿名セッション中はサインアップが「登録(昇格)」になる。
 */
export function AuthScreen() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const isGuest = state === 'guest';
  const { form, setMode, setEmail, setPassword, submit } = useAuthForm({
    isGuest,
    onSuccess: () => navigate('/settings'),
  });

  if (state === 'unavailable') {
    return (
      <Screen title="アカウント">
        <p className="text-body text-ink-secondary">
          ローカル開発では認証は無効です。Supabase を設定すると利用できます。
        </p>
      </Screen>
    );
  }

  const isSignup = form.mode === 'signup';
  const submitLabel = isSignup ? (isGuest ? '登録する' : 'アカウントを作成') : 'ログイン';

  return (
    <Screen title={isSignup ? 'アカウントを作成' : 'ログイン'}>
      {isGuest && isSignup && (
        <p className="mt-1 mb-4 text-meta text-ink-secondary">
          いまのデータはそのまま引き継がれます。
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
          <span className="text-meta text-ink-secondary">メールアドレス</span>
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
          <span className="text-meta text-ink-secondary">パスワード(6文字以上)</span>
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
            {authMessage(form.errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={form.submitting}
          className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
        >
          {form.submitting ? '処理中…' : submitLabel}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(isSignup ? 'signin' : 'signup')}
        className="mt-4 min-h-11 text-meta text-accent"
      >
        {isSignup ? 'アカウントを持っている場合はログイン' : 'アカウントを作成する'}
      </button>
    </Screen>
  );
}
