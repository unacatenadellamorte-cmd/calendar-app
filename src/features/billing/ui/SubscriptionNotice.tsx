import { t, useLanguage } from '@/i18n';
import { Capacitor } from '@capacitor/core';
import { openExternalUrl } from '@/platform/externalLinks';

export function SubscriptionNotice() {
  useLanguage();
  const platform = Capacitor.getPlatform();
  return (
    <div className="mt-3 text-meta text-ink-secondary">
      <p>
        {t(
          '定期購入は1か月ごとの自動更新です。価格は購入前のストア画面で確認できます。解約は購入したストアで行ってください。',
        )}
      </p>
      <p>
        {t(
          'アカウントを削除しても定期購入は解約されません。Googleへ送った予定のコピーも残ります。',
        )}
      </p>
      <div className="flex flex-wrap gap-3">
        {platform !== 'ios' && (
          <button
            type="button"
            className="min-h-11 text-accent"
            onClick={() =>
              void openExternalUrl('https://play.google.com/store/account/subscriptions')
            }
          >
            {t('Google Playで定期購入を管理')}
          </button>
        )}
        {platform !== 'android' && (
          <button
            type="button"
            className="min-h-11 text-accent"
            onClick={() =>
              void openExternalUrl('https://apps.apple.com/account/subscriptions')
            }
          >
            {t('App Storeで定期購入を管理')}
          </button>
        )}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer text-accent">
          {t('有料プランの利用条件')}
        </summary>
        <p>
          {t(
            'Google アカウント1件の同期と予定反映は無料で利用できます。複数アカウントプランは最大5件まで接続でき、写真表示を含みます。',
          )}
        </p>
        <p>
          {t(
            '写真表示は有料プランの有効期間中のみ利用できます。期限切れ後は写真を表示せず、有効な契約の確認後に再開できます。返金・解約の条件は購入したストアの規定に従います。',
          )}
        </p>
        <p>
          {t(
            'シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。',
          )}
        </p>
      </details>
    </div>
  );
}
