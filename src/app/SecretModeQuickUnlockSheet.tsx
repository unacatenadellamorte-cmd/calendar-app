import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { resolveMessage } from '@/data/messages';
import { useSecretMode } from './secret-mode-context';

interface SecretModeQuickUnlockSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 上部アバターのダブルタップ(ロック中・パスコード設定済み)から開くクイックパスコード
 * 入力シート(spec-secret-mode-avatar-toggle)。`SecretModeSettingsScreen` の「解除する」
 * フォームと同じ文言・挙動(パスコード欄1つ + 送信ボタン)。「パスコードを変更」機能は
 * 持たない(既存の `/secret-mode` への導線に任せる、spec Never)。
 *
 * 正しいパスコードで `unlock()` が成功したら `onClose` を呼んでシートを閉じる。
 * 誤りならシートは開いたままエラー表示する(`useSecretMode().errorKey`)。
 */
export function SecretModeQuickUnlockSheet({ open, onClose }: SecretModeQuickUnlockSheetProps) {
  const { unlock, errorKey, dismissError } = useSecretMode();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 開くたびに前回の入力値・エラー・送信中フラグを引きずらない(EventFormSheet と同じパターン)。
  useEffect(() => {
    if (!open) return;
    setInput('');
    setSubmitting(false);
    dismissError();
  }, [open, dismissError]);

  // バックドロップタップ・Escape・キャンセルボタンのいずれで閉じても、入力済みのパスコードを
  // state に残さない(BottomSheet の onClose は open が false に切り替わるだけなので、
  // 次に開くまでの間 state に平文が残ってしまうのを防ぐ)。
  // useCallback で参照を安定させる(`onClose` にのみ依存) -- ここをただの関数式にすると
  // 毎キー入力ごとに新しい関数になり、それを渡している BottomSheet 側の
  // `useEffect(..., [open, onClose])` がタイプ中に毎回発火して `panelRef.current?.focus()`
  // がフォーカスを入力欄から奪ってしまう(実際に発生させて確認済みの回帰)。
  const handleClose = useCallback(() => {
    setInput('');
    onClose();
  }, [onClose]);

  return (
    <BottomSheet open={open} title="シークレットモードを解除" onClose={handleClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          const ok = await unlock(input.trim());
          setSubmitting(false);
          // 誤りだった場合も含め、パスコードの入力値は毎回クリアする(平文を画面に残さない、
          // SecretModeSettingsScreen の解除フォームと同じ挙動)。
          setInput('');
          if (ok) onClose();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">パスコード</span>
          <input
            type="password"
            inputMode="text" autoCapitalize="none" autoCorrect="off"
            autoComplete="off"
            maxLength={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || input.trim() === ''}
            className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
          >
            {submitting ? '確認中…' : '解除する'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 px-4 text-body text-ink-secondary"
          >
            キャンセル
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
