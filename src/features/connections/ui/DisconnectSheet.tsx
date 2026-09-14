import { BottomSheet } from '@/ui/BottomSheet';
import { resolveMessage } from '@/data/messages';
import type { DisconnectImpact } from '@/data/connections';

interface DisconnectSheetProps {
  open: boolean;
  /** シートの見出し文言。呼び出し側が渡す(例: 「Google 接続を解除」)。 */
  title: string;
  /** 消える件数のプレビュー。取得できていなければ null(件数は「—」)。 */
  impact: DisconnectImpact | null;
  busy: boolean;
  errorKey: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 接続を解除する前の確認シート(Story 3.4 / 5.3、UX-DR13 破壊的操作)。
 * Google・端末カレンダーの両方で再利用する(`title` は呼び出し側が渡す)。
 * 消える予定・カレンダーの件数を先に見せ、専用ボタンでのみ確定する。元に戻せない。
 */
export function DisconnectSheet({
  open,
  title,
  impact,
  busy,
  errorKey,
  onConfirm,
  onClose,
}: DisconnectSheetProps) {
  const events = impact ? `${impact.events} 件` : '—';
  const calendars = impact ? `${impact.calendars} 件` : '—';

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-body text-ink-primary">
          取り込んだ予定 {events}・カレンダー {calendars} が、この端末と
          サーバーの両方から消えます。
        </p>
        <p className="text-meta text-ink-secondary">
          自分で作った予定は残ります。解除は元に戻せません。
        </p>

        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 flex-1 rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 flex-1 rounded-sm bg-danger px-4 text-body font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? '解除中…' : '接続を解除'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
