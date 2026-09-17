import { t, useLanguage } from '@/i18n';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/ui/BottomSheet';
import { resolveMessage } from '@/data/messages';
import { validateEventInput, type EventItem, type NewEventInput } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import {
  localInputToUtcIso,
  nowLocalInput,
  plusMinutesLocal,
  todayLocalDate,
  utcIsoToLocalInput,
} from '@/lib/datetime';
import { ReminderPicker } from './ReminderPicker';
/** 新規作成時の初期値のヒント(月ビューの日タップ / 週ビューのスロットタップから)。 */
export interface EventSeed {
  /** "YYYY-MM-DD"。終日オフのまま、この日付の 9:00–10:00 を既定にする。 */
  date?: string;
  /** "YYYY-MM-DDTHH:mm"。この時刻から1時間を既定にする。 */
  startLocal?: string;
}
interface EventFormSheetProps {
  open: boolean;
  editing: EventItem | null;
  calendars: Calendar[];
  seed?: EventSeed;
  onClose: () => void;
  onCreate: (input: NewEventInput) => Promise<boolean>;
  onUpdate: (current: EventItem, input: NewEventInput) => Promise<boolean>;
  /** 編集中の予定を削除する(渡されたときだけ削除ボタンを出す)。 */
  onDelete?: (event: EventItem) => void;
  /** リマインダーを設定/解除する(Story 5.4)。編集時のみ使う。 */
  onSetReminder: (event: EventItem, minutes: number | null) => Promise<boolean>;
}
interface FormState {
  title: string;
  calendarId: string;
  allDay: boolean;
  startLocal: string;
  endLocal: string;
  dateLocal: string;
  note: string;
  isSecret: boolean;
}
function initialState(
  editing: EventItem | null,
  calendars: Calendar[],
  seed?: EventSeed,
): FormState {
  const firstCalendar = calendars[0]?.id ?? '';
  if (!editing) {
    const seededStart =
      seed?.startLocal ?? (seed?.date ? `${seed.date}T09:00` : nowLocalInput());
    const seededEnd = seed?.startLocal
      ? plusMinutesLocal(seed.startLocal, 60)
      : seed?.date
        ? `${seed.date}T10:00`
        : nowLocalInput(60);
    return {
      title: '',
      calendarId: firstCalendar,
      allDay: false,
      startLocal: seededStart,
      endLocal: seededEnd,
      dateLocal: seed?.date ?? seededStart.slice(0, 10),
      note: '',
      isSecret: false,
    };
  }
  return {
    title: editing.title,
    calendarId: editing.calendarId,
    allDay: editing.allDay,
    startLocal: editing.startsAt ? utcIsoToLocalInput(editing.startsAt) : nowLocalInput(),
    endLocal: editing.endsAt ? utcIsoToLocalInput(editing.endsAt) : nowLocalInput(60),
    dateLocal: editing.eventDate ?? todayLocalDate(),
    note: editing.note ?? '',
    isSecret: editing.isSecret,
  };
}
function toInput(form: FormState): NewEventInput {
  const common = {
    calendarId: form.calendarId,
    title: form.title,
    note: form.note || null,
    isSecret: form.isSecret,
  };
  return form.allDay
    ? { ...common, allDay: true, eventDate: form.dateLocal }
    : {
        ...common,
        allDay: false,
        startsAt: localInputToUtcIso(form.startLocal),
        endsAt: localInputToUtcIso(form.endLocal),
      };
}
export function EventFormSheet({
  open,
  editing,
  calendars,
  seed,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onSetReminder,
}: EventFormSheetProps) {
  useLanguage();
  const [form, setForm] = useState<FormState>(() => initialState(editing, calendars, seed));
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(initialState(editing, calendars, seed));
    setErrorKey(null);
    setSubmitting(false);
  }, [open, editing, calendars, seed]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrorKey(null);
  };
  return (
    <BottomSheet
      open={open}
      title={editing ? t('予定を編集') : t('予定を追加')}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting) return;
          const input = toInput(form);
          const invalid = validateEventInput(input);
          if (invalid) {
            setErrorKey(invalid.messageKey);
            return;
          }
          setSubmitting(true);
          const done = editing ? await onUpdate(editing, input) : await onCreate(input);
          setSubmitting(false);
          if (done) onClose();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('タイトル')}</span>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
            maxLength={200}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('カレンダー')}</span>
          <select
            value={form.calendarId}
            onChange={(e) => set('calendarId', e.target.value)}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
          <span className="text-body text-ink-primary">{t('終日')}</span>
        </label>

        {form.allDay ? (
          <label className="flex flex-col gap-1">
            <span className="text-meta text-ink-secondary">{t('日付')}</span>
            <input
              type="date"
              value={form.dateLocal}
              onChange={(e) => set('dateLocal', e.target.value)}
              required
              className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
            />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-meta text-ink-secondary">{t('開始')}</span>
              <input
                type="datetime-local"
                value={form.startLocal}
                onChange={(e) => set('startLocal', e.target.value)}
                required
                className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-meta text-ink-secondary">{t('終了')}</span>
              <input
                type="datetime-local"
                value={form.endLocal}
                onChange={(e) => set('endLocal', e.target.value)}
                required
                className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
              />
            </label>
          </>
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isSecret}
            onChange={(e) => set('isSecret', e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
          <span className="text-body text-ink-primary">{t('シークレット')}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('メモ')}</span>
          <textarea
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            maxLength={2000}
            rows={2}
            className="rounded-sm border border-border-hairline bg-surface-base px-3 py-2 text-body"
          />
        </label>

        {editing && !editing.allDay && (
          <ReminderPicker
            value={editing.reminderMinutes}
            onChange={(minutes) => onSetReminder(editing, minutes)}
          />
        )}

        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || calendars.length === 0}
          className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
        >
          {submitting ? t('保存中…') : t('保存')}
        </button>

        {editing && onDelete && (
          <button
            type="button"
            onClick={() => {
              onDelete(editing);
              onClose();
            }}
            className="min-h-11 text-meta text-danger"
          >
            {t('この予定を削除')}
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
