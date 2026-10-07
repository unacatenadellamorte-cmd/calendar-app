import { t, useLanguage } from '@/i18n';
import { EVENT_STAMPS, type EventStampId } from '@/lib/event-stamps';
import { EventStamp } from './EventStamp';
import { labelTextColor } from '@/lib/event-label';

export function StampPicker({
  value,
  color,
  onChange,
  disabled = false,
}: {
  value: EventStampId | null;
  color: string;
  onChange: (id: EventStampId | null) => void;
  disabled?: boolean;
}) {
  useLanguage();
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="text-meta text-ink-secondary">{t('スタンプ（任意）')}</legend>
      <div
        className="grid grid-cols-4 gap-2 sm:grid-cols-8"
        role="group"
        aria-label={t('スタンプを選択')}
      >
        <button
          type="button"
          aria-pressed={!value}
          aria-label={t('スタンプなし')}
          onClick={() => onChange(null)}
          className="flex aspect-square items-center justify-center rounded-full border border-border-hairline text-meta"
        >
          ×
        </button>
        {EVENT_STAMPS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            aria-label={t(name)}
            title={t(name)}
            aria-pressed={value === id}
            onClick={() => onChange(id as EventStampId)}
            className="flex aspect-square items-center justify-center rounded-full border-2 p-2 focus-visible:outline focus-visible:outline-2"
            style={{
              color,
              borderColor: value === id ? color : 'var(--color-border-hairline)',
              // 線の色はタグ色を保ち、白・濃紺の背景で明暗どちらでも見分ける。
              backgroundColor: labelTextColor(color),
              boxShadow: value === id ? '0 0 0 2px var(--color-accent)' : undefined,
            }}
          >
            <EventStamp id={id} color={color} size={24} label={false} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
