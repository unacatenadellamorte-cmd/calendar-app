import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { CALENDAR_COLORS, nextUnusedColor } from '@/data/calendar-colors';
import type { Calendar } from '@/data/calendars';
interface CalendarFormSheetProps {
  open: boolean;
  /** 編集対象。null なら新規作成。 */
  editing: Calendar | null;
  /** 既存カレンダーの使用済み色(新規作成時の初期色決めに使う)。 */
  usedColors: readonly string[];
  onClose: () => void;
  onSubmit: (values: { name: string; color: string }) => Promise<boolean>;
  onDelete?: (calendar: Calendar) => void;
}
export function CalendarFormSheet({
  open,
  editing,
  usedColors,
  onClose,
  onSubmit,
  onDelete,
}: CalendarFormSheetProps) {
  useLanguage();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CALENDAR_COLORS[0]!.hex);
  const [submitting, setSubmitting] = useState(false);
  const initializedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      initializedKey.current = null;
      return;
    }
    const key = editing ? `editing:${editing.id}` : 'new';
    if (initializedKey.current === key) return;
    initializedKey.current = key;
    setName(editing?.name ?? '');
    setColor(editing?.color ?? nextUnusedColor(usedColors));
    setSubmitting(false);
  // 一覧の再取得では配列や要素が新しい参照になるため、開く対象のキーで一度だけ初期化する。
  }, [open, editing, usedColors]);
  const canDelete = Boolean(editing && !editing.isShift && onDelete);
  return (
    <BottomSheet
      open={open}
      title={editing ? t('カレンダーを編集') : t('カレンダーを作成')}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          const okResult = await onSubmit({ name, color });
          setSubmitting(false);
          if (okResult) onClose();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('名前')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-ink-secondary">{t('色')}</legend>
          <div className="flex flex-wrap gap-2">
            {CALENDAR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={t(c.name)}
                aria-pressed={color === c.hex}
                onClick={() => setColor(c.hex)}
                className={[
                  'h-11 w-11 rounded-sm border',
                  color === c.hex ? 'border-accent' : 'border-border-hairline',
                ].join(' ')}
                style={{ backgroundColor: c.hex }}
              >
                {color === c.hex && <span aria-hidden="true" className="text-on-accent drop-shadow">✓</span>}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
        >
          {submitting ? t('保存中…') : t('保存')}
        </button>

        {canDelete && editing && (
          <button
            type="button"
            onClick={() => onDelete?.(editing)}
            className="min-h-11 text-meta text-danger"
          >
            {t('このカレンダーを削除')}
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
