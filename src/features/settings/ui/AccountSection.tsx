import { t, useLanguage } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth-context';
import { useState } from 'react';
/**
 * 設定画面のアカウント欄。状態別に表示を変える。
 *  - unavailable: ローカル開発では無効
 *  - guest:       登録を促す + ログイン導線
 *  - authenticated: メール表示 + ログアウト
 */
export function AccountSection() {
  useLanguage();
  const { state, email, signOut, deleteAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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
        {(state === 'guest' || state === 'authenticated') && (
          <div className="mt-4 border-t border-border-hairline pt-4">
            {!confirming ? <button type="button" className="min-h-11 text-danger" onClick={() => setConfirming(true)}>{t('アカウントを削除')}</button> : (
              <div role="group" aria-label={t('アカウント削除の確認')}>
                <p>{t('アカウント、予定、プロフィール、シフト、タグ、連携認証情報を削除します。この端末のキャッシュ、未送信操作、通知、ウィジェット、背景画像も消去します。')}</p>
                <p className="mt-2">{t('Google・端末カレンダーの原本は削除しません。削除は取り消せません。')}</p>
                <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />{t('対象データが失われることを確認しました')}</label>
                {failed && <p role="alert">{t('削除は完了していません。通信を確認して再試行してください。')}</p>}
                <button type="button" className="mt-3 min-h-11 text-danger" disabled={!accepted || busy} onClick={async () => {
                  setBusy(true);
                  const result = await deleteAccount();
                  setFailed(!result.ok);
                  setBusy(false);
                }}>{t('完全に削除する')}</button>
                <button type="button" className="ml-4 min-h-11" disabled={busy} onClick={() => { setConfirming(false); setAccepted(false); }}>{t('やめる')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
