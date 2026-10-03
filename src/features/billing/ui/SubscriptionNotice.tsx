import { t, useLanguage } from '@/i18n';
import { openExternalUrl } from '@/platform/externalLinks';

export function SubscriptionNotice() {
  useLanguage();
  return <div className="mt-3 text-meta text-ink-secondary">
    <p>{t('定期購入は1か月ごとの自動更新です。価格は購入前のストア画面で確認できます。解約は購入したストアで行ってください。')}</p>
    <p>{t('アカウントを削除しても定期購入は解約されません。Googleへ送った予定のコピーも残ります。')}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="min-h-11 text-accent" onClick={() => void openExternalUrl('https://play.google.com/store/account/subscriptions')}>{t('Google Playで定期購入を管理')}</button>
      <button type="button" className="min-h-11 text-accent" onClick={() => void openExternalUrl('https://apps.apple.com/account/subscriptions')}>{t('App Storeで定期購入を管理')}</button>
    </div>
    <details><summary className="min-h-11 cursor-pointer text-accent">{t('有料プランの利用条件')}</summary>
      <p>{t('予定反映プランはGoogleアカウント1件、複数アカウントプランは最大5件で予定反映も含みます。無料利用は1件の読み取り専用です。')}</p>
      <p>{t('失効後は新しい反映を停止します。Google側のコピーは残ります。返金・解約の条件は購入したストアの規定に従います。')}</p>
      <p>{t('シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。')}</p>
    </details>
  </div>;
}
