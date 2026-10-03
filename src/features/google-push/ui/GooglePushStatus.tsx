import { t, useLanguage } from '@/i18n';
import { useGooglePush } from '../model/useGooglePush';
import { useEntitlements } from '@/features/billing/model/useEntitlements';

export function GooglePushStatus({ eventId }: { eventId: string }) {
  useLanguage();
  const push=useGooglePush(undefined,eventId);
  const { canWrite }=useEntitlements();
  if (!push.statuses.length && !push.failed) return null;
  return <div className="text-meta">
    {!canWrite && <p>{t('予定反映が停止中')}</p>}
    {push.statuses.some(s=>s.state==='error') ? <p role="alert">{t('Googleへ反映できませんでした')}</p>
      : push.statuses.some(s=>s.state==='pending') ? <p>{t('Googleへの反映待ち')}</p>
      : push.statuses.some(s=>s.state==='orphaned') ? <p>{t('Google側で削除された予定は再作成しません。')}</p>
      : push.statuses.some(s=>s.state==='paused') ? <p>{t('予定反映が停止中')}</p>
      : push.statuses.length>0 && <p>{t('Googleへの反映処理済み')}</p>}
    {push.failed && <p role="alert">{t('Googleへ反映できませんでした')}</p>}
    <button type="button" className="min-h-11 text-accent" disabled={push.busy} onClick={()=>void push.retry()}>{t('反映状態を更新・再試行')}</button>
  </div>;
}
