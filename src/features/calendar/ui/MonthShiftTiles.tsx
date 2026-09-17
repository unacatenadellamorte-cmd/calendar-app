import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Calendar } from '@/data/calendars';
import type { EventItem } from '@/data/events';
import type { ShiftTemplate } from '@/data/shift-templates';
import { createShifts } from '@/data/shifts';
import { resolveMessage } from '@/data/messages';
import { useShiftTemplates } from '@/features/shifts/model/useShiftTemplates';

export function MonthShiftTiles({ date, calendars, enabled, onCreated }: {
  date: string;
  calendars: Calendar[];
  enabled: boolean;
  onCreated: (events: EventItem[]) => void;
}) {
  const shifts = useShiftTemplates(enabled);
  const navigate = useNavigate();
  const calendar = calendars.find((item) => item.isShift && item.source === 'local');
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

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
      <h2 className="text-body font-semibold">登録シフト</h2>
      <p className="mt-1 text-meta text-ink-secondary">{date}に追加 · 日付をタップして選択、長押しで予定入力</p>
      {(error || shifts.errorKey) && <p role="alert" className="mt-2 text-meta text-danger">{resolveMessage(error ?? shifts.errorKey!)}</p>}
      {shifts.loading ? <p className="text-meta">読み込み中…</p> : shifts.templates.length === 0 ? (
        <button type="button" className="mt-2 inline-block text-accent" onClick={() => navigate('/shift-templates')}>お気に入りシフトを登録する</button>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {shifts.templates.map((template) => (
            <button key={template.id} type="button" disabled={busy || !calendar}
              onClick={() => void pick(template)}
              aria-label={`${template.name}を${date}に追加`}
              className="flex aspect-square min-h-20 flex-col items-center justify-center gap-1 rounded-md border border-border-hairline border-t-4 bg-surface-raised p-2 disabled:opacity-50"
              style={{ borderTopColor: template.color }}>
              <span className="max-w-full break-words text-body font-semibold">{template.name}</span>
              <span className="text-meta text-ink-secondary">{template.startLocal}–{template.endLocal}</span>
            </button>
          ))}
        </div>
      )}
      {!calendar && <p className="mt-2 text-meta text-ink-secondary">シフト用カレンダーを準備しています。</p>}
      <p role="status" className="mt-2 text-meta text-ink-secondary">{busy ? '追加中…' : notice}</p>
    </section>
  );
}
