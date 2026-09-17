import { t, useLanguage } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth-context';
/**
 * 設定画面のアカウント欄。状態別に表示を変える。
 *  - unavailable: ローカル開発では無効
 *  - guest:       登録を促す + ログイン導線
 *  - authenticated: メール表示 + ログアウト
 */
export function AccountSection() {
  useLanguage();
  const { state, email, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <section aria-labelledby="account-heading" className="mt-6">
      <h2 id="account-heading" className="text-body font-semibold text-ink-primary">
        {t('アカウント')}
      </h2>

      <div className="mt-3 rounded-md border border-border-hairline bg-surface-raised p-4">
        {state === 'loading' && (
          <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
        )}

        {state === 'unavailable' && (
          <p className="text-meta text-ink-secondary">
            {t('ローカル開発では認証は無効です。Supabase を設定すると利用できます。')}
          </p>
        )}

        {state === 'guest' && (
          <>
            <p className="text-body text-ink-primary">{t('お試しモードで使っています')}</p>
            <p className="mt-1 text-meta text-ink-secondary">
              {t('登録すると、このデータを複数の端末で使えます。')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
            >
              {t('アカウントを作成 / ログイン')}
            </button>
          </>
        )}

        {state === 'authenticated' && (
          <>
            <p className="text-meta text-ink-secondary">{t('ログイン中')}</p>
            <p className="mt-1 text-body text-ink-primary">{email}</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
            >
              {t('ログアウト')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
