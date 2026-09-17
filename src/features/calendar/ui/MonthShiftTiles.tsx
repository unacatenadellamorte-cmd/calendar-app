import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Calendar } from '@/data/calendars';
import type { EventItem } from '@/data/events';
import type { ShiftTemplate } from '@/data/shift-templates';
import { createShifts } from '@/data/shifts';
import { resolveMessage } from '@/data/messages';
import { useShiftTemplates } from '@/features/shifts/model/useShiftTemplates';
import { addDays, eventOccursOnDate } from '@/lib/calendar-view';
import { BottomSheet } from '@/ui/BottomSheet';

export function MonthShiftTiles({ date, calendars, enabled, onCreated, events, onDateChange, onRemove }: {
  date: string;
  calendars: Calendar[];
  enabled: boolean;
  onCreated: (events: EventItem[]) => void;
  events: EventItem[];
  onDateChange: (date: string) => void;
  onRemove: (event: EventItem) => Promise<void>;
}) {
  const shifts = useShiftTemplates(enabled);
  const navigate = useNavigate();
  const calendar = calendars.find((item) => item.isShift && item.source === 'local');
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dayShifts = events.filter((event) => event.source === 'local'
    && (event.shiftTemplateId !== null || calendars.some((item) => item.id === event.calendarId && item.isShift))
    && eventOccursOnDate(event, date));
  const closeDelete = useCallback(() => setDeleteOpen(false), []);
  useEffect(() => {
    setDeleteOpen(false);
    setNotice('');
    setError(null);
  }, [date]);

  const remove = async (event: EventItem) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    setError(null);
    try {
      // 既存の削除・通知取消・取り消しバナーを利用する。
      await onRemove(event);
      setDeleteOpen(false);
    } catch {
      setError('data/query');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const requestDelete = () => {
    if (busyRef.current || dayShifts.length === 0) return;
    const onlyShift = dayShifts[0];
    if (dayShifts.length === 1 && onlyShift) void remove(onlyShift);
    else setDeleteOpen(true);
  };

  const pick = async (template: ShiftTemplate) => {
    if (busyRef.current || !calendar) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const result = await createShifts(calendar.id, template, [date]);
      if (!result.ok) { setError(result.error.messageKey); return; }
      onCreated(result.value);
      setNotice(`${date}に「${template.name}」を追加しました`);
    } catch {
      setError('data/query');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="mt-4" aria-label="登録シフト">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-body font-semibold">登録シフト</h2>
        <div className="flex items-center gap-1" role="group" aria-label="シフトの日付移動と削除">
          <button type="button" aria-label="前日に移動" title="前日に移動" disabled={busy}
            onClick={() => onDateChange(addDays(date, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border-hairline text-ink-secondary disabled:opacity-40">←</button>
          <button type="button" aria-label="翌日に移動" title="翌日に移動" disabled={busy}
            onClick={() => onDateChange(addDays(date, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border-hairline text-ink-secondary disabled:opacity-40">→</button>
          <button type="button" aria-label="選択日のシフトを削除" title="選択日のシフトを削除"
            disabled={busy || dayShifts.length === 0} onClick={requestDelete}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border-hairline text-danger disabled:opacity-40">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-1 text-meta text-ink-secondary">{date}に追加 · 日付をタップして選択、長押しで予定入力</p>
      {(error || shifts.errorKey) && <p role="alert" className="mt-2 text-meta text-danger">{resolveMessage(error ?? shifts.errorKey!)}</p>}
      {shifts.loading ? <p className="text-meta">読み込み中…</p> : shifts.templates.length === 0 ? (
        <button type="button" className="mt-2 inline-block text-accent" onClick={() => navigate('/shift-templates')}>お気に入りシフトを登録する</button>
      ) : (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {shifts.templates.map((template) => (
            <button key={template.id} type="button" disabled={busy || !calendar}
              onClick={() => void pick(template)}
              aria-label={`${template.name}を${date}に追加`}
              className="flex aspect-square min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-sm border border-border-hairline border-t-2 bg-surface-raised p-1 disabled:opacity-50"
              style={{ borderTopColor: template.color }}>
              <span className="line-clamp-2 max-w-full break-words text-xs font-semibold">{template.name}</span>
              <span className="text-[10px] leading-tight text-ink-secondary"><span className="block">{template.startLocal}–</span><span className="block">{template.endLocal}</span></span>
            </button>
          ))}
        </div>
      )}
      {!calendar && <p className="mt-2 text-meta text-ink-secondary">シフト用カレンダーを準備しています。</p>}
      <p role="status" className="mt-2 text-meta text-ink-secondary">{busy ? '処理中…' : notice}</p>
      <BottomSheet open={deleteOpen} title="削除するシフトを選択" onClose={closeDelete}>
        <p className="mb-2 text-meta text-ink-secondary">{date}</p>
        <div className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
          {dayShifts.map((event) => (
            <button key={event.id} type="button" disabled={busy} onClick={() => void remove(event)}
              className="flex min-h-11 items-center justify-between gap-3 rounded-sm border border-border-hairline px-3 py-2 text-left disabled:opacity-40">
              <span className="break-words text-body">{event.title}</span>
              <span className="shrink-0 text-meta text-ink-secondary">{event.startsAt ? new Date(event.startsAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '終日'}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </section>
  );
}
