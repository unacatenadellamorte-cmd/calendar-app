import { t } from '@/i18n';
import { CALENDAR_COLORS } from '@/data/calendar-colors';
import { labelTextColor } from '@/lib/event-label';

interface LabelColorPresetsProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** 既存の日本語アクセシブル名を保つ必要がある画面では色コードを省略する。 */
  includeHexInAriaLabel?: boolean;
}

/** カレンダー・予定・予定タグで共通利用する色プリセット。 */
export function LabelColorPresets({
  value,
  onChange,
  disabled = false,
  includeHexInAriaLabel = true,
}: LabelColorPresetsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('色')}>
      {CALENDAR_COLORS.map((color) => {
        const selected = value.toUpperCase() === color.hex.toUpperCase();
        return (
          <button
            key={color.id}
            type="button"
            aria-label={includeHexInAriaLabel ? `${t(color.name)} ${color.hex}` : t(color.name)}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(color.hex)}
            className={[
              'min-h-11 min-w-11 h-11 w-11 rounded-sm border',
              selected ? 'border-accent' : 'border-border-hairline',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
            style={{ backgroundColor: color.hex, color: labelTextColor(color.hex) }}
          >
            {selected && <span aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
