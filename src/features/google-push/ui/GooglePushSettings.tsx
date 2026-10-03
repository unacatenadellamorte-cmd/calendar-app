import { useState } from 'react';
import { t, useLanguage } from '@/i18n';
import { useEntitlements } from '@/features/billing/model/useEntitlements';
import { PlanSheet } from '@/features/billing/ui/PlanSheet';
import { useGooglePush } from '../model/useGooglePush';

export function GooglePushSettings({ calendarId }: { calendarId: string }) {
  useLanguage();
  const push = useGooglePush(calendarId);
  const { canWrite } = useEntitlements();
  const [account, setAccount] = useState('');
  const [destination, setDestination] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const selected = push.connections.find((item) => item.id === account);
  const button = 'min-h-11 rounded-sm border border-border-hairline px-3 text-meta disabled:opacity-50';
  return <section className="flex flex-col gap-2 border-t border-border-hairline pt-3" aria-label={t('Googleへの予定反映')}>
    <h3 className="text-meta font-semibold">{t('Googleへの予定反映')}</h3>
    <p className="text-meta text-ink-secondary">{t('このカレンダーの既存・今後の予定をGoogleへ反映します。Google側の編集は、アプリの次の編集で上書きされます。')}</p>
    <p className="text-meta text-ink-secondary">{t('シークレット予定は送りません。あとからシークレットにした予定は、送信済みコピーも削除します。')}</p>
    {push.target?.enabled && <p className="text-meta">{t('現在の反映先')}: {push.connections.find(c => c.id === push.target?.connectionId)?.googleEmail} / {push.target.googleCalendarId}</p>}
    {!canWrite ? <><p className="text-meta">{t('予定反映が停止中')}</p><button type="button" className={button} onClick={() => setPlanOpen(true)}>{t('プランを選ぶ')}</button></> : <>
      <label className="text-meta">{t('Googleアカウント')}<select className="min-h-11 w-full bg-surface-base" value={account} disabled={push.busy || !push.loaded}
        onChange={e => { const id=e.target.value; setAccount(id); setDestination(''); if (id && push.connections.find(c => c.id===id)?.writeGranted) void push.loadChoices(id); }}>
        <option value="">{t('選択してください')}</option>{push.connections.filter(c => c.status==='active').map(c => <option key={c.id} value={c.id}>{c.googleEmail}</option>)}
      </select></label>
      {selected && <button type="button" className={button} disabled={push.busy} onClick={() => void push.authorize(account).then(done => { if (done) void push.loadChoices(account); })}>{t('Googleへの書き込みを許可')}</button>}
      {selected?.writeGranted && <>
        <label className="text-meta">{t('反映先カレンダー')}<select className="min-h-11 w-full bg-surface-base" value={destination} disabled={push.busy} onChange={e => setDestination(e.target.value)}>
          <option value="">{t('選択してください')}</option>{push.choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <button type="button" className={button} disabled={push.busy || !destination} onClick={() => void push.save(account,destination)}>{t('この反映先を保存')}</button>
      </>}
    </>}
    {push.target?.enabled && <button type="button" className={button} disabled={push.busy} onClick={() => void push.save(null,null)}>{t('反映を停止')}</button>}
    <p className="text-meta text-ink-secondary">{t('反映先の変更・停止では、以前のGoogle側コピーは残ります。')}</p>
    {push.statuses.some(s => s.state==='error') && <p role="alert" className="text-meta text-danger">{t('Googleへ反映できませんでした')}</p>}
    {push.statuses.some(s => s.state==='pending') && <p className="text-meta">{t('Googleへの反映待ち')}</p>}
    {push.statuses.some(s => s.state==='orphaned') && <p className="text-meta">{t('Google側で削除された予定は再作成しません。')}</p>}
    {push.failed && <p role="alert" className="text-meta text-danger">{t('Googleへの反映設定を確認してください。契約・接続・書き込み許可が必要です。')}</p>}
    {push.statuses.length>0 && <button type="button" className={button} disabled={push.busy} onClick={() => void push.retry()}>{t('反映状態を更新・再試行')}</button>}
    <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} reason="settings" />
  </section>;
}
