import { useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import '@/styles/tokens.css';
import { applyLanguage, type Language } from '@/i18n';
import { StampPicker } from '@/ui/StampPicker';
import { EventChip } from '@/features/calendar/ui/EventChip';
import { FirstRunTutorial } from '@/features/tutorial/ui/FirstRunTutorial';
import { EVENT_STAMPS, type EventStampId } from '@/lib/event-stamps';
import type { Calendar } from '@/data/calendars';
import type { EventItem } from '@/data/events';

// 認証・通信・実予定に接続せず、実装した表示部品だけを架空データで確認する。
const calendar: Calendar = {
  id: 'sample',
  name: 'サンプル',
  color: '#2563EB',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
};
const event: EventItem = {
  id: 'sample',
  calendarId: 'sample',
  title: '勤務',
  allDay: true,
  startsAt: null,
  endsAt: null,
  eventDate: '2026-10-07',
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
  isSecret: false,
  createdAt: '',
  updatedAt: '',
};

export default function Preview() {
  const [view, setView] = useState('stamps');
  const [dark, setDark] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [color, setColor] = useState('#2563EB');
  const [stamp, setStamp] = useState<EventStampId | null>('work');
  const [done, setDone] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.fontSize = zoom ? '24px' : '16px';
  }, [dark, zoom]);
  return (
    <div className="mx-auto max-w-2xl bg-surface-base text-ink-primary">
      <div className="flex flex-wrap gap-3 border-b border-border-hairline p-3 text-meta">
        <label>
          表示{' '}
          <select
            aria-label="確認する画面"
            value={view}
            onChange={(e) => {
              setView(e.target.value);
              setDone(false);
            }}
          >
            <option value="stamps">スタンプ</option>
            <option value="tutorial">初回案内</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />{' '}
          暗い背景
        </label>
        <label>
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />{' '}
          文字拡大
        </label>
        <label>
          言語{' '}
          <select
            aria-label="言語"
            onChange={(e) => applyLanguage(e.target.value as Language)}
            defaultValue="ja"
          >
            {['ja', 'en', 'fr', 'es', 'zh', 'ko'].map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </label>
      </div>
      {view === 'tutorial' ? (
        done ? (
          <p className="p-4">案内完了（確認画面のみ）</p>
        ) : (
          <FirstRunTutorial onFinish={() => setDone(true)} />
        )
      ) : (
        <main className="space-y-4 p-4">
          <h1 className="text-title">32種類のスタンプ</h1>
          <label>
            ラベル色{' '}
            <input
              aria-label="ラベル色"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <StampPicker value={stamp} color={color} onChange={setStamp} />
          <h2 className="text-body">月表示：絵のみ／名称あり／旧予定</h2>
          <div
            className="grid grid-cols-7 gap-1"
            style={{ '--month-event-font-size': zoom ? '12px' : '8px' } as CSSProperties}
          >
            {EVENT_STAMPS.slice(0, 7).map(([id, name], i) => (
              <div key={id} className="min-w-0 space-y-1 border border-border-hairline p-0.5">
                <p className="text-meta">{i + 1}</p>
                <EventChip
                  event={{
                    ...event,
                    id,
                    title: name,
                    stampId: id,
                    stampOnly: true,
                    labelColor: color,
                  }}
                  calendar={calendar}
                  month
                  showTime={false}
                  onTap={() => {}}
                />
                <EventChip
                  event={{ ...event, stampId: id, stampOnly: false, labelColor: color }}
                  calendar={calendar}
                  month
                  showTime={false}
                  onTap={() => {}}
                />
                <EventChip
                  event={{ ...event, labelColor: color }}
                  calendar={calendar}
                  month
                  showTime={false}
                  onTap={() => {}}
                />
              </div>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
