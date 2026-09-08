import { useEffect, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { resolveMessage } from '@/data/messages';
import { formatDayTitle } from '@/lib/datetime';
import type { ShiftTemplate } from '@/data/shift-templates';
import { ShiftTemplateChip } from './ShiftTemplateChip';

interface QuickShiftSheetProps {
  open: boolean;
  /** 対象の起点日 "YYYY-MM-DD"。 */
  date: string;
  templates: ShiftTemplate[];
  /** シフト用カレンダーが取得できているか(未取得ならチップ無効)。 */
  shiftReady: boolean;
  errorKey: string | null;
  onClose: () => void;
  /** テンプレを選んだ。`dayCount` 日ぶん連続で入れる。 */
  onPick: (template: ShiftTemplate, dayCount: number) => Promise<boolean>;
  /** 「予定を追加」── 従来の予定フォームへ。 */
  onAddEvent: () => void;
  /** 「お気に入りシフトを作る」── テンプレ管理へ。 */
  onCreateTemplate: () => void;
}

const MAX_DAYS = 14;

export function QuickShiftSheet({
  open,
  date,
  templates,
  shiftReady,
  errorKey,
  onClose,
  onPick,
  onAddEvent,
  onCreateTemplate,
}: QuickShiftSheetProps) {
  const [dayCount, setDayCount] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDayCount(1);
      setBusy(false);
    }
  }, [open, date]);

  const pick = async (template: ShiftTemplate) => {
    if (busy || !shiftReady) return;
    setBusy(true);
    const done = await onPick(template, dayCount);
    setBusy(false);
    if (done) onClose();
  };

  return (
    <BottomSheet open={open} title={formatDayTitle(date)} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}

        {templates.length === 0 ? (
          <>
            <p className="text-body text-ink-secondary">
              よく使うシフトを登録すると1タップで入れられます。
            </p>
            <button
              type="button"
              onClick={onCreateTemplate}
              className="min-h-11 rounded-sm border border-dashed border-accent px-4 text-body text-accent"
            >
              ＋ お気に入りシフトを作る
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-meta text-ink-secondary">この日から</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="日数を減らす"
                  disabled={dayCount <= 1}
                  onClick={() => setDayCount((n) => Math.max(1, n - 1))}
                  className="h-11 w-11 rounded-sm border border-border-hairline text-body disabled:opacity-40"
                >
                  −
                </button>
                <span className="tabular w-10 text-center text-body" aria-live="polite">
                  {dayCount} 日
                </span>
                <button
                  type="button"
                  aria-label="日数を増やす"
                  disabled={dayCount >= MAX_DAYS}
                  onClick={() => setDayCount((n) => Math.min(MAX_DAYS, n + 1))}
                  className="h-11 w-11 rounded-sm border border-border-hairline text-body disabled:opacity-40"
                >
                  ＋
                </button>
              </div>
            </div>

            <div
              className={[
                'flex gap-2 overflow-x-auto pb-1',
                shiftReady ? '' : 'pointer-events-none opacity-50',
              ].join(' ')}
              aria-disabled={!shiftReady}
            >
              {templates.map((t) => (
                <span key={t.id} className="flex-none">
                  <ShiftTemplateChip template={t} onTap={() => void pick(t)} />
                </span>
              ))}
            </div>
            {!shiftReady && (
              <p className="text-meta text-ink-secondary">
                シフト用カレンダーを準備しています。少し待って再度お試しください。
              </p>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onAddEvent}
          className="min-h-11 text-meta text-accent"
        >
          シフト以外の予定を追加
        </button>
      </div>
    </BottomSheet>
  );
}
