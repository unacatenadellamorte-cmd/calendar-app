import { t, useLanguage } from '@/i18n';
import { useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { PLANS, formatPlanPrice } from '../model/plans';
import { usePurchase } from '../model/usePurchase';

interface PlanSheetProps {
  open: boolean;
  onClose: () => void;
  /** どの操作から開いたか。説明文だけが変わる。 */
  reason: 'first-connect' | 'add-account';
  /**
   * 渡したときだけ「無料で1つ接続する」を出す(初回接続時)。無料の1アカウント
   * (読み取り専用)の接続は課金と無関係に必ず選べるようにする。
   */
  onContinueFree?: () => void;
}

/**
 * Google 接続時に下から出すプラン案内(CAP-5)。
 * 購入処理は usePurchase の抽象越しに呼ぶ。課金基盤(RevenueCat)が入るまでは
 * 購入ボタンは「準備中」で押せない。価格は plans.ts の仮表示。
 */
export function PlanSheet({ open, onClose, reason, onContinueFree }: PlanSheetProps) {
  useLanguage();
  const { available, purchase } = usePurchase();
  const [notice, setNotice] = useState<string | null>(null);
  const buy = async (plan: (typeof PLANS)[number]['id']) => {
    setNotice(null);
    const result = await purchase(plan);
    if (!result.ok) setNotice(t('購入はまだ準備中です。'));
  };
  return (
    <BottomSheet open={open} title={t('プランを選ぶ')} onClose={onClose}>
      <p className="text-meta text-ink-secondary">
        {reason === 'first-connect'
          ? t('無料プランでは Google アカウント1つのカレンダーを読み取り専用で取り込めます。')
          : t('2つ目以降の Google アカウントを接続するには「複数アカウント」プランが必要です。')}
      </p>
      <p className="mt-1 text-meta text-ink-secondary">
        {t('有料プランは準備中のため、現在は購入できません。')}
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {PLANS.map((plan) => (
          <li
            key={plan.id}
            aria-label={t(plan.title)}
            className="rounded-md border border-border-hairline bg-surface-raised p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-body font-semibold text-ink-primary">{t(plan.title)}</h3>
              <span className="shrink-0 text-meta text-ink-secondary">
                {formatPlanPrice(plan.price)}
              </span>
            </div>
            <ul className="mt-2 list-disc pl-5 text-meta text-ink-secondary">
              {plan.features.map((f) => (
                <li key={f}>{t(f)}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={!available}
              onClick={() => void buy(plan.id)}
              aria-label={
                available ? t('{0} を購入', [t(plan.title)]) : t('{0}(準備中)', [t(plan.title)])
              }
              className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-50"
            >
              {available ? t('購入する') : t('準備中')}
            </button>
          </li>
        ))}
      </ul>

      {notice && (
        <p role="status" className="mt-2 text-meta text-ink-secondary">
          {notice}
        </p>
      )}

      <p className="mt-3 text-meta text-ink-secondary">
        {t('定期購入は自動で更新されます。価格・期間・解約方法は各ストアの設定に従います。')}
      </p>

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
          {t('今はしない')}
        </button>
      )}
    </BottomSheet>
  );
}
