import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
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
import { isAllowedExternalUrl, openExternalUrl, openMap } from '@/platform/externalLinks';
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
  location: string;
  url: string;
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
      location: '',
      url: '',
      isSecret: false,
    };
  }
  // 以前の不具合で外部カレンダーに保存された local 予定は、編集時に
  // 自作カレンダーへ移せるよう、外部の所属先をそのまま初期値にしない。
  const currentCalendar = calendars.some((calendar) => calendar.id === editing.calendarId)
    ? editing.calendarId
    : firstCalendar;
  return {
    title: editing.title,
    calendarId: currentCalendar,
    allDay: editing.allDay,
    startLocal: editing.startsAt ? utcIsoToLocalInput(editing.startsAt) : nowLocalInput(),
    endLocal: editing.endsAt ? utcIsoToLocalInput(editing.endsAt) : nowLocalInput(60),
    dateLocal: editing.eventDate ?? todayLocalDate(),
    note: editing.note ?? '',
    location: editing.location ?? '',
    url: editing.url ?? '',
    isSecret: editing.isSecret,
  };
}
function toInput(form: FormState): NewEventInput {
  const common = {
    calendarId: form.calendarId,
    title: form.title,
    note: form.note || null,
    location: form.location.trim() || null,
    url: form.url.trim() || null,
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
  // Google/端末カレンダーは読み取り専用。フォームへ渡す候補から外すことで、
  // 新規作成・local 予定の移動先のどちらでも外部への直接書き込みを防ぐ。
  const editableCalendars = calendars.filter((calendar) => calendar.source === 'local');
  const latestPropsRef = useRef({ editing, calendars: editableCalendars, seed });
  latestPropsRef.current = { editing, calendars: editableCalendars, seed };
  const [form, setForm] = useState<FormState>(() =>
    initialState(editing, editableCalendars, seed),
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const launchRequest = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!open) return;
    const current = latestPropsRef.current;
    setForm(initialState(current.editing, current.calendars, current.seed));
    setErrorKey(null);
    setLaunchError(null);
    setSubmitting(false);
    // calendars は refetch のたびに配列が新しくなる。ここへ含めると入力中の
    // タイトル・日時が消えるため、フォームを開く単位(予定ID/seed)だけで初期化する。
    return () => { launchRequest.current += 1; };
  }, [open, editing?.id, seed?.date, seed?.startLocal]);
  const firstEditableCalendarId = editableCalendars[0]?.id ?? '';
  useEffect(() => {
    // カレンダー取得前にフォームを開いた場合だけ、一覧到着後に所属先を補完する。
    // 入力値全体は触らず、ユーザーが選択・入力した値も保持する。
    if (!open || form.calendarId || !firstEditableCalendarId) return;
    setForm((current) =>
      current.calendarId ? current : { ...current, calendarId: firstEditableCalendarId },
    );
  }, [open, form.calendarId, firstEditableCalendarId]);
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
          // UTC 変換は空欄・不正値で RangeError になり得るため、変換前の
          // フォーム値を検証する。これで入力途中でも画面内エラーに留める。
          const invalid = validateEventInput(
            form.allDay
              ? { title: form.title, allDay: true, eventDate: form.dateLocal, location: form.location, url: form.url.trim() || null }
              : {
                  title: form.title,
                  location: form.location,
                  url: form.url.trim() || null,
                  allDay: false,
                  startsAt: form.startLocal,
                  endsAt: form.endLocal,
                },
          );
          if (invalid) {
            setErrorKey(invalid.messageKey);
            return;
          }
          let input: NewEventInput;
          try {
            input = toInput(form);
          } catch {
            setErrorKey('event/invalid-time');
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
            {editableCalendars.map((c) => (
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

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('場所')}</span>
          <input
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            maxLength={1000}
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        {form.location.trim() && (
          <button
            type="button"
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-raised px-3 text-accent"
            onClick={() => {
              const request = ++launchRequest.current;
              setLaunchError(null);
              void openMap(form.location).then((ok) => {
                if (request === launchRequest.current && !ok) setLaunchError('地図を開けませんでした');
              });
            }}
          >
            {t('地図を開く')}
          </button>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('予定URL')}</span>
          <input
            type="url"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            maxLength={2048}
            placeholder="https://"
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        {isAllowedExternalUrl(form.url) && (
          <button
            type="button"
            className="min-h-11 rounded-sm border border-border-hairline bg-surface-raised px-3 text-accent"
            onClick={() => {
              const request = ++launchRequest.current;
              setLaunchError(null);
              void openExternalUrl(form.url).then((ok) => {
                if (request === launchRequest.current && !ok) setLaunchError('リンクを開けませんでした');
              });
            }}
          >
            {t('リンクを開く')}
          </button>
        )}
        {launchError && <p role="alert" className="text-meta text-danger">{t(launchError)}</p>}

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
          disabled={submitting || editableCalendars.length === 0}
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
