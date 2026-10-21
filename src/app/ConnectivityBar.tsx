import { t, useLanguage } from '@/i18n';
import { useOnline } from './online-context';
/**
 * 接続状態の細いバー。オフライン中の告知、復帰時の送信中表示、同期の一部失敗通知。
 * トーン規約: 感嘆符・催促なし、簡潔・体言止め。
 */
export function ConnectivityBar() {
  useLanguage();
  const { online, pendingCount, flushing, syncNotice, dismissSyncNotice, retryPending } = useOnline();
  if (syncNotice) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between bg-surface-raised px-4 py-1 text-meta text-danger"
      >
        {syncNotice}
        <button type="button" onClick={dismissSyncNotice} className="text-accent">
          {t('閉じる')}
        </button>
      </div>
    );
  }
  if (!online) {
    return (
      <div
        role="status"
        className="bg-ink-primary px-4 py-1 text-center text-meta text-surface-base"
      >
        {t('オフライン ・ 変更は接続後に送信されます {0}', [
          pendingCount > 0 && t('(未送信 {0} 件)', [pendingCount]),
        ])}
      </div>
    );
  }
  if (flushing) {
    return (
      <div
        role="status"
        className="bg-surface-raised px-4 py-1 text-center text-meta text-ink-secondary"
      >
        {t('送信中…')}
      </div>
    );
  }
  if (pendingCount > 0) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-3 bg-surface-raised px-4 py-1 text-meta text-ink-secondary"
      >
        {t('未送信 {0} 件', [pendingCount])}
        {online && (
          <button
            type="button"
            onClick={retryPending}
            className="min-h-11 rounded-sm px-2 text-accent"
          >
            {t('再送する')}
          </button>
        )}
      </div>
    );
  }
  return null;
}
