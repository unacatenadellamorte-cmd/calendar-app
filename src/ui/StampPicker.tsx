import { t, useLanguage } from '@/i18n';
import { useId, useState } from 'react';
import { EVENT_STAMPS, type EventStampId } from '@/lib/event-stamps';
import { EventStamp } from './EventStamp';

export function StampPicker({
  value,
  onChange,
  disabled = false,
  collapsible = false,
}: {
  value: EventStampId | null;
  onChange: (id: EventStampId | null) => void;
  disabled?: boolean;
  /** 予定登録では「＋」を押すまで一覧を隠す。 */
  collapsible?: boolean;
}) {
  useLanguage();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const visible = !collapsible || expanded;
  const color = 'var(--color-accent)';
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="text-meta text-ink-secondary">{t('スタンプ（任意）')}</legend>
      {collapsible && (
        <button
          type="button"
          aria-label={t('スタンプを選択')}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-11 w-11 items-center justify-center rounded-full border border-border-hairline bg-surface-base text-title text-accent"
        >
          <span aria-hidden="true">{expanded ? '−' : '＋'}</span>
        </button>
      )}
      {visible && <div
        id={listId}
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
              backgroundColor: 'var(--color-surface-base)',
              boxShadow: value === id ? '0 0 0 2px var(--color-accent)' : undefined,
            }}
          >
            <EventStamp id={id} size={24} label={false} />
          </button>
        ))}
      </div>}
    </fieldset>
  );
}
