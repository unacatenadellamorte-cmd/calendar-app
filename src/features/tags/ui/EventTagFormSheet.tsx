import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { t, useLanguage } from '@/i18n';
import type { EventTag, NewEventTagInput } from '@/data/event-tags';
import { labelTextColor } from '@/lib/event-label';

interface Props {
  open: boolean;
  editing: EventTag | null;
  errorKey: string | null;
  onClose: () => void;
  onSubmit: (value: NewEventTagInput) => Promise<boolean>;
  onDelete?: (tag: EventTag) => Promise<boolean>;
}

const field =
  'min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body';

function errorText(key: string): string {
  const messages: Record<string, string> = {
    'event-tag/invalid-name': '予定名称を1〜200文字で入力してください',
    'event-tag/invalid-color': 'ラベル色は6桁のカラーコードで入力してください',
    'event-tag/invalid-time': '開始・終了時刻を入力し、異なる時刻にしてください',
  };
  return t(messages[key] ?? '保存に失敗しました。もう一度お試しください');
}

export function EventTagFormSheet({
  open,
  editing,
  errorKey,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  useLanguage();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [startLocal, setStartLocal] = useState('09:00');
  const [endLocal, setEndLocal] = useState('18:00');
  const [submitting, setSubmitting] = useState(false);
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      initialized.current = null;
      return;
    }
    const key = editing ? `editing:${editing.id}` : 'new';
    if (initialized.current === key) return;
    initialized.current = key;
    setName(editing?.name ?? '');
    setColor(editing?.color ?? '#2563EB');
    setStartLocal(editing?.startLocal ?? '09:00');
    setEndLocal(editing?.endLocal ?? '18:00');
    setSubmitting(false);
  }, [open, editing]);

  return (
    <BottomSheet
      open={open}
      title={editing ? t('予定タグを編集') : t('予定タグを作成')}
      onClose={onClose}
      dismissible={!submitting}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          const done = await onSubmit({ name, color, startLocal, endLocal });
          setSubmitting(false);
          if (done) onClose();
        }}
      >
        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {errorText(errorKey)}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('予定名称')}</span>
          <input
            aria-label={t('予定名称')}
            value={name}
            disabled={submitting}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('ラベル色')}</span>
          <input
            aria-label={t('ラベル色')}
            type="color"
            disabled={submitting}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-11 w-full rounded-sm border border-border-hairline bg-surface-base p-1"
          />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('開始')}</span>
            <input
              aria-label={t('開始')}
              type="time"
              disabled={submitting}
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('終了')}</span>
            <input
              aria-label={t('終了')}
              type="time"
              disabled={submitting}
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className={field}
            />
          </label>
        </div>
        <p className="text-meta text-ink-secondary">{t('終了が開始より前なら翌日終了')}</p>
        <div
          className="rounded-sm px-3 py-2 text-body"
          style={{ backgroundColor: color, color: labelTextColor(color) }}
        >
          <span className="block min-w-0 truncate">{name || t('予定のプレビュー')}</span>
        </div>
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
            disabled={submitting}
            onClick={async () => {
              if (submitting) return;
              setSubmitting(true);
              const done = await onDelete(editing);
              setSubmitting(false);
              if (done) onClose();
            }}
            className="min-h-11 text-meta text-danger disabled:opacity-60"
          >
            {t('この予定タグを削除')}
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
