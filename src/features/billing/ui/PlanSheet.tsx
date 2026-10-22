import { t, useLanguage } from '@/i18n';
import { useState, type MouseEvent } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { privacyPolicyUrl } from '@/platform/ads';
import { openExternalUrl } from '@/platform/externalLinks';
import { resolveMessage } from '@/data/messages';
import { PLANS, formatPlanPrice, type PlanPrice } from '../model/plans';
import { useEntitlements } from '../model/useEntitlements';
import { usePurchase } from '../model/usePurchase';
import { purchaseStatusText } from './purchaseStatusText';
import { SubscriptionNotice } from './SubscriptionNotice';

interface PlanSheetProps {
  open: boolean;
  onClose: () => void;
  /** どの操作から開いたか。説明文だけが変わる。 */
  reason: 'first-connect' | 'add-account' | 'settings' | 'photos';
  /**
   * 渡したときだけ「無料で1つ接続する」を出す(初回接続時)。無料の1アカウント
   * の同期と予定反映は課金と無関係に必ず選べるようにする。
   */
  onContinueFree?: () => void;
}

/**
 * Google 接続時や設定画面から出すプラン案内(CAP-5)。
 * 購入処理は usePurchase の抽象越しに呼ぶ(RevenueCat SDK)。SDK が使えない環境
 * (Web・キー未設定)では購入ボタンは「準備中」。SDK有効時は価格の取得後だけ購入可能。
 * 権利の有無は entitlements(DB)で決め、二重課金を防ぐ(複数アカウント契約中は
 * 「写真表示」の購入ボタンを出さない)。
 */
export function PlanSheet({ open, onClose, reason, onContinueFree }: PlanSheetProps) {
  useLanguage();
  const {
    supported,
    available,
    loginRequired,
    prices,
    preparation,
    retry,
    status,
    busy,
    purchase,
    restore,
    openManagement,
  } = usePurchase();
  const { hasMultiAccount, canViewPhotos, hasLegacyWrite, hasPaidPlan, loading: checkingEntitlements } = useEntitlements();
  const [notice, setNotice] = useState<string | null>(null);
  const buy = async (plan: (typeof PLANS)[number]['id']) => {
    setNotice(null);
    const result = await purchase(plan);
    if (!result.ok && result.reason === 'not-ready' && !supported) {
      setNotice(t('購入はまだ準備中です。'));
    }
  };
  const progress = purchaseStatusText(status);
  const openPrivacy = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openExternalUrl(privacyPolicyUrl);
  };
  return (
    <BottomSheet open={open} title={t('プランを選ぶ')} onClose={onClose}>
      <p className="text-meta text-ink-secondary">
        {reason === 'first-connect'
          ? t('Google アカウント1つの同期と予定反映は標準機能です。')
          : reason === 'add-account'
            ? t(
                '2つ目以降の Google アカウントを接続するには「複数アカウント」プランが必要です。',
              )
            : t(
                'Google アカウント1つの同期と予定反映は標準機能です。',
              )}
      </p>
      {hasLegacyWrite && (
        <p className="mt-2 text-meta text-ink-secondary">{t('旧「予定反映」プランの有効期間中も写真表示を利用できます。契約は自動で切り替わりません。')}</p>
      )}
      {!supported && (
        <p className="mt-1 text-meta text-ink-secondary">
          {t('有料プランは準備中のため、現在は購入できません。')}
        </p>
      )}
      {loginRequired && (
        <p role="note" className="mt-1 text-meta text-ink-secondary">
          {t('ログインが必要です。設定の「アカウント」からログインすると購入できます。')}
        </p>
      )}
      {supported &&
        !loginRequired &&
        (preparation.kind !== 'ready' || PLANS.some((plan) => !prices[plan.id])) && (
          <div className="mt-2 text-meta text-ink-secondary">
            <p role="note">
              {preparation.kind === 'loading'
                ? t('読み込み中…')
                : resolveMessage(preparation.messageKey ?? 'purchase/product-missing')}
            </p>
            {preparation.kind !== 'loading' && (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 text-accent"
                onClick={() => void retry()}
              >
                {t('再試行')}
              </button>
            )}
          </div>
        )}

      <ul className="mt-3 flex flex-col gap-3">
        {PLANS.map((plan) => {
          const storePrice = prices[plan.id];
          const price: PlanPrice = storePrice
            ? { kind: 'store', localizedPrice: storePrice }
            : plan.price;
          const included = plan.id === 'device_photos' && hasMultiAccount;
          const owned = plan.id === 'multi_account' ? hasMultiAccount : canViewPhotos;
          return (
            <li
              key={plan.id}
              aria-label={t(plan.title)}
              className="rounded-md border border-border-hairline bg-surface-raised p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-body font-semibold text-ink-primary">{t(plan.title)}</h3>
                <span className="shrink-0 text-meta text-ink-secondary">
                  {supported && !storePrice ? t('確認中…') : formatPlanPrice(price)}
                </span>
              </div>
              <ul className="mt-2 list-disc pl-5 text-meta text-ink-secondary">
                {plan.features.map((f) => (
                  <li key={f}>{t(f)}</li>
                ))}
              </ul>
              {included ? (
                <p className="mt-3 text-meta text-ink-secondary">
                  {t('複数アカウントプランに含まれています')}
                </p>
              ) : owned ? (
                <p className="mt-3 text-meta font-semibold text-ink-primary">{t('契約中')}</p>
              ) : (
                <>
                  {plan.id === 'multi_account' && canViewPhotos && (
                    <p className="mt-3 text-meta text-ink-secondary">
                      {t(
                        'プラン変更時の旧契約の扱いと請求時期は、ストアの確認画面と購読管理で確認してください。',
                      )}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={
                      !available || busy || checkingEntitlements || !storePrice || preparation.kind !== 'ready'
                    }
                    onClick={() => void buy(plan.id)}
                    aria-label={
                      supported
                        ? t('{0} を購入', [t(plan.title)])
                        : t('{0}(準備中)', [t(plan.title)])
                    }
                    className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-50"
                  >
                    {supported ? t('購入する') : t('準備中')}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <SubscriptionNotice />

      {(notice || progress) && (
        <p role="status" className="mt-2 text-meta text-ink-secondary">
          {notice ?? progress}
        </p>
      )}

      {supported && !loginRequired && (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={!available || busy}
            onClick={() => void restore()}
            className="min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-50"
          >
            {t('購入を復元')}
          </button>
          {hasPaidPlan && (
            <button
              type="button"
              disabled={!available || busy}
              onClick={() => void openManagement()}
              className="min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-50"
            >
              {t('購読を管理')}
            </button>
          )}
        </div>
      )}

      <p className="mt-3 text-meta text-ink-secondary">
        {t('定期購入は自動で更新されます。価格・期間・解約方法は各ストアの設定に従います。')}
      </p>
      {privacyPolicyUrl && (
        <a
          href={privacyPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openPrivacy}
          className="mt-1 inline-block text-meta text-accent"
        >
          {t('プライバシーポリシー')}
        </a>
      )}

      {onContinueFree ? (
        <button
          type="button"
          onClick={onContinueFree}
          className="mt-4 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
        >
          {t('無料で1つ接続する')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
        >
          {reason === 'settings' || reason === 'photos' ? t('閉じる') : t('今はしない')}
        </button>
      )}
    </BottomSheet>
  );
}
