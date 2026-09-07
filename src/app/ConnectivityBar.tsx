import { useOnline } from './online-context';

/**
 * 接続状態の細いバー。オフライン中の告知、復帰時の送信中表示、同期の一部失敗通知。
 * トーン規約: 感嘆符・催促なし、簡潔・体言止め。
 */
export function ConnectivityBar() {
  const { online, pendingCount, flushing, syncNotice, dismissSyncNotice } = useOnline();

  if (syncNotice) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between bg-surface-raised px-4 py-1 text-meta text-danger"
      >
        {syncNotice}
        <button type="button" onClick={dismissSyncNotice} className="text-accent">
          閉じる
        </button>
      </div>
    );
  }

  if (!online) {
    return (
      <div role="status" className="bg-ink-primary px-4 py-1 text-center text-meta text-surface-base">
        オフライン ・ 変更は接続後に送信されます
        {pendingCount > 0 && `(未送信 ${pendingCount} 件)`}
      </div>
    );
  }

  if (flushing) {
    return (
      <div role="status" className="bg-surface-raised px-4 py-1 text-center text-meta text-ink-secondary">
        送信中…
      </div>
    );
  }

  return null;
}
