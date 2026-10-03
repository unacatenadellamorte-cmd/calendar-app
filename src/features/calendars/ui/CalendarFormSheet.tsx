import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { CALENDAR_COLORS, nextUnusedColor } from '@/data/calendar-colors';
import type { Calendar } from '@/data/calendars';
import { LabelColorPresets } from '@/ui/LabelColorPresets';
import { GooglePushSettings } from '@/features/google-push/ui/GooglePushSettings';
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
  const [color, setColor] = useState(CALENDAR_COLORS[0]!.hex);
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
          <LabelColorPresets
            value={color}
            onChange={setColor}
            disabled={submitting}
            includeHexInAriaLabel={false}
          />
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
      {open && editing?.source === 'local' && <GooglePushSettings key={editing.id} calendarId={editing.id} />}
    </BottomSheet>
  );
}
