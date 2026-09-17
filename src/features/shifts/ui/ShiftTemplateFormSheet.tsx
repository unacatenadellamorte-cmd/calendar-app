import { t, useLanguage } from '@/i18n';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { CALENDAR_COLORS, nextUnusedColor } from '@/data/calendar-colors';
import { resolveMessage } from '@/data/messages';
import type { NewShiftTemplateInput, ShiftTemplate } from '@/data/shift-templates';
interface ShiftTemplateFormSheetProps {
  open: boolean;
  /** 編集対象。null なら新規作成。 */
  editing: ShiftTemplate | null;
  /** 既存テンプレの使用済み色(新規の初期色決め)。 */
  usedColors: readonly string[];
  /** 直近の送信エラーの messageKey(シート内に表示する)。 */
  errorKey: string | null;
  onClose: () => void;
  onSubmit: (values: NewShiftTemplateInput) => Promise<boolean>;
  onDelete?: (template: ShiftTemplate) => void;
}
const field =
  'min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body';
export function ShiftTemplateFormSheet({
  open,
  editing,
  usedColors,
  errorKey,
  onClose,
  onSubmit,
  onDelete,
}: ShiftTemplateFormSheetProps) {
  useLanguage();
  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [hourlyWage, setHourlyWage] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [color, setColor] = useState<string>(CALENDAR_COLORS[0]!.hex);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setStart(editing?.startLocal ?? '09:00');
    setEnd(editing?.endLocal ?? '18:00');
    setBreakMinutes(String(editing?.breakMinutes ?? 0));
    setHourlyWage(editing ? String(editing.hourlyWage) : '');
    setWorkplace(editing?.workplaceLabel ?? '');
    setColor(editing?.color ?? nextUnusedColor(usedColors));
    setSubmitting(false);
  }, [open, editing, usedColors]);
  return (
    <BottomSheet
      open={open}
      title={editing ? t('お気に入りシフトを編集') : t('お気に入りシフトを作成')}
      onClose={onClose}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          const done = await onSubmit({
            name,
            startLocal: start,
            endLocal: end,
            breakMinutes: Number(breakMinutes || 0),
            hourlyWage: Number(hourlyWage),
            workplaceLabel: workplace.trim() || null,
            color,
          });
          setSubmitting(false);
          if (done) onClose();
        }}
      >
        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('シフト名')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={field}
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('開始')}</span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('終了')}</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={field}
            />
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('休憩(分)')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('時給(円)')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={hourlyWage}
              onChange={(e) => setHourlyWage(e.target.value)}
              className={field}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('勤務先ラベル(任意)')}</span>
          <input
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value)}
            maxLength={100}
            className={field}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-meta text-ink-secondary">{t('色')}</legend>
          <div className="flex flex-wrap gap-2">
            {CALENDAR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-pressed={color === c.hex}
                onClick={() => setColor(c.hex)}
                className={[
                  'h-11 w-11 rounded-sm border',
                  color === c.hex ? 'border-accent' : 'border-border-hairline',
                ].join(' ')}
                style={{ backgroundColor: c.hex }}
              />
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

        {editing && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(editing)}
            className="min-h-11 text-meta text-danger"
          >
            {t('このお気に入りシフトを削除')}
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
