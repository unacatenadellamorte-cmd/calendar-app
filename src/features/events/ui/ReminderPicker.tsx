import { t, useLanguage } from '@/i18n';
import { useEffect, useState } from 'react';
import { resolveMessage } from '@/data/messages';
import { requestNotificationPermission } from '@/platform/reminders';
/**
 * リマインダー設定の小さい共有UI(Story 5.4)。`EventFormSheet`/`EventDetailSheet` の
 * 両方から使う。プリセット(10分/30分/1時間前)+ カスタム分数 + 「リマインダーなし」。
 * 選択したら即座に `onChange` で保存する(フォームの「保存」ボタンとは独立。
 * `EventDetailSheet` では唯一の書き込み可能な項目になる)。
 *
 * 通知許可はリマインダーをオンにする操作のたびに要求する(既に確定していれば
 * OS は再プロンプトせず現在の状態を返すだけなので安全)。許可が無くても
 * `onChange` は呼ぶ ── DB への保存は通知の可否と独立して常に成功させる
 * (spec I/O Matrix「通知権限が無い」行)。
 */
const PRESETS: {
  label: string;
  minutes: number;
}[] = [
  {
    get label() {
      return t('10分前');
    },
    minutes: 10,
  },
  {
    get label() {
      return t('30分前');
    },
    minutes: 30,
  },
  {
    get label() {
      return t('1時間前');
    },
    minutes: 60,
  },
];
/** `data/events.ts` の `REMINDER_MINUTES_MAX`(DB の CHECK 制約)と同じ値。UI側の二重防御。 */
const REMINDER_MINUTES_MAX = 10080;
interface ReminderPickerProps {
  /** 現在のリマインダー(分)。未設定は null。 */
  value: number | null;
  onChange: (minutes: number | null) => Promise<boolean>;
}
export function ReminderPicker({ value, onChange }: ReminderPickerProps) {
  useLanguage();
  const [selected, setSelected] = useState<number | null>(value);
  const [customValue, setCustomValue] = useState('');
  const [warningKey, setWarningKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSelected(value);
    setCustomValue(
      value !== null && !PRESETS.some((p) => p.minutes === value) ? String(value) : '',
    );
  }, [value]);
  const apply = async (minutes: number | null) => {
    setSaving(true);
    setWarningKey(null);
    if (minutes !== null) {
      let perm: string;
      try {
        perm = await requestNotificationPermission();
      } catch {
        perm = 'denied';
      }
      if (perm !== 'granted') setWarningKey('notification/permission-denied');
    }
    const prev = selected;
    setSelected(minutes);
    const ok = await onChange(minutes);
    if (!ok) setSelected(prev);
    setSaving(false);
  };
  const customInvalid =
    customValue.trim() !== '' &&
    (!Number.isFinite(Number(customValue)) ||
      Number(customValue) < 0 ||
      Number(customValue) > REMINDER_MINUTES_MAX);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-meta text-ink-secondary">{t('リマインダー')}</span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.minutes}
            type="button"
            disabled={saving}
            aria-pressed={selected === p.minutes}
            onClick={() => void apply(p.minutes)}
            className={`min-h-11 rounded-sm border px-3 text-body disabled:opacity-60 ${
              selected === p.minutes
                ? 'border-accent bg-accent text-on-accent'
                : 'border-border-hairline text-ink-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={saving || selected === null}
          onClick={() => void apply(null)}
          className="min-h-11 rounded-sm border border-border-hairline px-3 text-body text-ink-secondary disabled:opacity-60"
        >
          {t('リマインダーなし')}
        </button>
      </div>

      <label className="flex items-center gap-2">
        <span className="text-meta text-ink-secondary">{t('カスタム(分)')}</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          className="min-h-11 w-20 rounded-sm border border-border-hairline bg-surface-base px-2 text-body"
        />
        <button
          type="button"
          disabled={saving || customValue.trim() === '' || customInvalid}
          onClick={() => void apply(Math.floor(Number(customValue)))}
          className="min-h-11 rounded-sm border border-border-hairline px-3 text-body text-accent disabled:opacity-60"
        >
          {t('設定')}
        </button>
      </label>

      {warningKey && (
        <p role="alert" className="text-meta text-danger">
          {resolveMessage(warningKey)}
        </p>
      )}
    </div>
  );
}
