import { t } from '@/i18n';
import { resolveMessage } from '@/data/messages';
import type { PurchaseStatus } from '../model/usePurchase';

/** 進行状態の表示文言。null は何も出さない。 */
export function purchaseStatusText(status: PurchaseStatus): string | null {
  switch (status.kind) {
    case 'working':
      return status.action === 'restore' ? t('購入を復元しています…') : t('処理しています…');
    case 'syncing':
      return t('反映中…');
    case 'timeout':
      return t('反映に時間がかかっています。しばらくしてから「購入を復元」をお試しください');
    case 'settled':
      return t('購入が反映されました。');
    case 'nothing-to-restore':
      return t('復元できる購入は見つかりませんでした。');
    case 'no-management-url':
      return t('管理できる購読が見つかりません。ストアの購読管理から確認してください。');
    case 'error':
      return resolveMessage(status.messageKey);
    default:
      return null;
  }
}
