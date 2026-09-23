import { adsSupported, privacyPolicyUrl, showAdsPrivacy, useAdsState } from '@/platform/ads';
import { t, useLanguage } from '@/i18n';

export function AdsPrivacySection() {
  useLanguage();
  const { privacyRequired, busy, error } = useAdsState();
  if (!adsSupported() && !privacyPolicyUrl) return null;
  return (
    <section className="mt-6 flex flex-col gap-2" aria-label={t('プライバシー')}>
      {privacyPolicyUrl && <a href={privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-accent">{t('プライバシーポリシー')}</a>}
      {adsSupported() && privacyRequired && <>
        <button type="button" disabled={busy} onClick={() => void showAdsPrivacy()} className="min-h-11 rounded-md border border-border-hairline bg-surface-raised px-4 text-left text-body text-accent disabled:opacity-50">{t('広告のプライバシー設定')}</button>
        {error && <p role="alert" className="text-meta text-danger">{t('同意設定を更新できませんでした。通信状態を確認して、もう一度試してください。')}</p>}
      </>}
    </section>
  );
}
