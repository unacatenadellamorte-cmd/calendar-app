import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MonthView } from '@/features/calendar/ui/MonthView';
import { DayEventPanel } from '@/features/calendar/ui/DayEventPanel';
import { WeekView } from '@/features/calendar/ui/WeekView';
import { StampPicker } from '@/ui/StampPicker';
import { EventStamp } from '@/ui/EventStamp';
import { applyTheme, type ThemePreference } from '@/features/settings/model/useTheme';
import { addDays, groupEventsByDay, makePriorityOf } from '@/lib/calendar-view';
import type { Calendar } from '@/data/calendars';
import type { EventItem } from '@/data/events';
import type { EventStampId } from '@/lib/event-stamps';
import '@/styles/global.css';

// 実部品の見た目だけを確認する。認証・保存・課金・OS写真APIは使わない。
const calendar: Calendar = { id: 'qa', name: '確認用', color: '#2563eb', source: 'local', isShift: false, isVisible: true, priority: 0, createdAt: '', updatedAt: '' };
const calendars = new Map([[calendar.id, calendar]]);
const events: EventItem[] = [{ id: 'qa-event', calendarId: 'qa', title: '確認用の予定', allDay: false, startsAt: '2026-10-23T01:00:00Z', endsAt: '2026-10-23T02:00:00Z', eventDate: null, note: null, source: 'local', breakMinutes: null, hourlyWage: null, workplaceLabel: null, shiftTemplateId: null, reminderMinutes: null, isSecret: false, createdAt: '', updatedAt: '', stampId: 'work', stampOnly: false }];
const byDay = groupEventsByDay(events, makePriorityOf(calendars));

export function Preview() {
  const [date, setDate] = useState('2026-10-23');
  const [mode, setMode] = useState('月拡大');
  const [stamp, setStamp] = useState<EventStampId | null>('work');
  const version = useMemo(() => ({ events, calendars }), []);
  return <main className="mx-auto max-w-[390px] space-y-4 bg-surface-base p-3 text-ink-primary">
    <h1>週・日送りとスタンプのローカル確認</h1>
    <label>テーマ<select aria-label="テーマ" defaultValue="light" onChange={(event) => applyTheme(event.target.value as ThemePreference)}>{Object.entries({ light: 'ライト', dark: 'ダーク', sakura: '桜', leaf: '若葉', ocean: '海', lavender: 'ラベンダー' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="flex gap-3">{['月拡大', '日'].map((item) => <button type="button" key={item} onClick={() => setMode(item)}>{item}</button>)}</div>
    <p>{date}</p>
    {mode === '月拡大' ? <>
      <MonthView cursor={date} collapsedToWeekOf={date} byDay={byDay} calendarById={calendars} today="2026-10-23" onDayTap={setDate} onDayDoubleTap={setDate} onBackToMonth={() => {}} onSwipeLeft={() => setDate(addDays(date, 7))} onSwipeRight={() => setDate(addDays(date, -7))} contentVersion={version} />
      <DayEventPanel date={date} byDay={byDay} calendarById={calendars} onEventTap={() => {}} onAddEvent={() => {}} onDayShift={(delta) => setDate(addDays(date, delta))} contentVersion={version} />
    </> : <WeekView cursor={date} events={events} calendarById={calendars} today="2026-10-23" onSlotTap={() => {}} onEventTap={() => {}} onDateChange={setDate} />}
    <StampPicker collapsible value={stamp} onChange={setStamp} />
    <div className="flex items-center gap-2 rounded-sm bg-blue-600 p-2 text-white">{stamp && <EventStamp id={stamp} />}選択中のスタンプ</div>
  </main>;
}

applyTheme('light');
createRoot(document.getElementById('root')!).render(<Preview />);
