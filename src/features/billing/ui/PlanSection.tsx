import { useState } from 'react';
import { t, useLanguage } from '@/i18n';
import { useAuth } from '@/app/auth-context';
import { useEntitlements } from '../model/useEntitlements';
import { usePurchase } from '../model/usePurchase';
import { PlanSheet } from './PlanSheet';
import { purchaseStatusText } from './purchaseStatusText';

/**
 * 設定画面の「プラン」欄(CAP-5)。現在の状態(価格は書かない)・購入・復元・管理。
 * ゲスト(お試しモード)は購入できないので、案内だけ出す。
 */
export function PlanSection() {
  useLanguage();
  const { state } = useAuth();
  const { hasMultiAccount, canWrite } = useEntitlements();
  const { supported, available, busy, status, restore, openManagement } = usePurchase();
  const [sheetOpen, setSheetOpen] = useState(false);
  if (state !== 'guest' && state !== 'authenticated') return null;

  const current = hasMultiAccount ? t('複数アカウント') : canWrite ? t('予定反映') : t('無料');
  const progress = purchaseStatusText(status);
  const buttonClass =
    'min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-50';
  return (
    <section aria-labelledby="plan-heading" className="mt-6">
      <h2 id="plan-heading" className="text-body font-semibold text-ink-primary">
        {t('プラン')}
      </h2>
      <div className="mt-3 flex flex-col gap-2 rounded-md border border-border-hairline bg-surface-raised p-4">
        {state === 'guest' ? (
          <p className="text-meta text-ink-secondary">
            {t('ログインが必要です。設定の「アカウント」からログインすると購入できます。')}
          </p>
        ) : (
          <>
            <p className="text-meta text-ink-secondary">{t('現在のプラン')}</p>
            <p className="text-body text-ink-primary">{current}</p>
            <button type="button" onClick={() => setSheetOpen(true)} className={buttonClass}>
              {t('プランを選ぶ')}
            </button>
            {supported && (
              <button
                type="button"
                disabled={!available || busy}
                onClick={() => void restore()}
                className={buttonClass}
              >
                {t('購入を復元')}
              </button>
            )}
            {supported && canWrite && (
              <button
                type="button"
                disabled={!available || busy}
                onClick={() => void openManagement()}
                className={buttonClass}
              >
                {t('購読を管理')}
              </button>
            )}
            {progress && (
              <p role="status" className="text-meta text-ink-secondary">
                {progress}
              </p>
            )}
          </>
        )}
      </div>
      <PlanSheet open={sheetOpen} reason="settings" onClose={() => setSheetOpen(false)} />
    </section>
  );
}
