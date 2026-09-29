import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Calendar } from '@/data/calendars';
import type { EventItem } from '@/data/events';
import { useEvents } from '../model/useEvents';
import { EventFormSheet } from './EventFormSheet';
import { MonthView } from '@/features/calendar/ui/MonthView';
import { groupEventsByDay, makePriorityOf } from '@/lib/calendar-view';

// フォーム・フック・保存変換・再取得は実装を使い、サーバー境界だけを置き換える。
const database = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
vi.mock('@/data/supabase', () => ({ supabase: {
  from(table: string) {
    let single = false;
    let columns = '*';
    let mutation: Record<string, unknown> | undefined;
    const chain = {
      select(value: string) { columns = value; return chain; },
      insert(value: Record<string, unknown>) { mutation = value; return chain; },
      update(value: Record<string, unknown>) { mutation = value; return chain; },
      eq() { return chain; }, is() { return chain; }, order() { return chain; },
      maybeSingle() { single = true; return chain; },
      single() { single = true; return chain; },
      then(resolve: (result: unknown) => unknown) {
        if (table === 'calendars') return resolve({ data: { source: 'local' }, error: null });
        if (mutation) database.row = {
          id: 'saved-event', created_at: '', updated_at: '', reminder_minutes: null,
          ...database.row, ...mutation,
        };
        const selected = database.row && Object.fromEntries(
          Object.entries(database.row).filter(([key]) => columns === '*' || columns.split(',').includes(key)),
        );
        return resolve({ data: single ? selected : selected ? [selected] : [], error: null });
      },
    };
    return chain;
  },
} }));
vi.mock('@/data/event-tags', () => ({ listEventTags: async () => ({ ok: true, value: [{
  id: 'tag', name: '色の確認', color: '#FFCC00', startLocal: '09:00', endLocal: '10:00',
  createdAt: '', updatedAt: '',
}] }) }));
vi.mock('@/data/reminders', () => ({ syncReminderForEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/platform/widget', () => ({ refreshFeaturedWidget: vi.fn().mockResolvedValue(undefined) }));

const calendar: Calendar = {
  id: 'local-calendar', name: '自作', source: 'local', color: '#0072B2',
  isShift: false, isVisible: true, priority: 0, createdAt: '', updatedAt: '',
};
function Harness() {
  const events = useEvents(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  return <>
    <button onClick={() => { setEditing(null); setOpen(true); }}>新規</button>
    <MonthView cursor="2026-09-29" today="2026-09-29"
      byDay={groupEventsByDay(events.events, makePriorityOf(new Map([[calendar.id, calendar]])))}
      calendarById={new Map([[calendar.id, calendar]])}
      onDayTap={() => { setEditing(events.events[0] ?? null); setOpen(true); }}
      onDayDoubleTap={() => {}} onBackToMonth={() => {}} />
    <EventFormSheet open={open} editing={editing} calendars={[calendar]}
      seed={{ date: '2026-09-29' }} onClose={() => setOpen(false)}
      onCreate={events.create} onUpdate={events.update} onSetReminder={events.setReminder} />
  </>;
}
beforeEach(() => { database.row = null; });

it('タグ色の作成、色入力での編集、再読込、カレンダー色への復帰を保存と月ラベルまで通す', async () => {
  const user = userEvent.setup();
  let view = render(<Harness />);
  await user.click(screen.getByRole('button', { name: '新規' }));
  await waitFor(() => expect(screen.getByLabelText('タグ')).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText('タグ'), 'tag');
  await user.click(screen.getByRole('button', { name: '保存' }));
  let chip = await screen.findByRole('button', { name: /色の確認 自作/ });
  expect(chip).toHaveStyle({ backgroundColor: '#FFCC00' });
  expect(database.row?.label_color).toBe('#FFCC00');
  await user.click(chip);
  fireEvent.input(screen.getByLabelText('ラベル色'), { target: { value: '#aabbcc' } });
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(database.row?.label_color).toBe('#aabbcc'));
  view.unmount();
  view = render(<Harness />);
  chip = await screen.findByRole('button', { name: /色の確認 自作/ });
  expect(chip).toHaveStyle({ backgroundColor: '#aabbcc' });
  await user.click(chip);
  await user.click(screen.getByRole('button', { name: '水浅葱 #06B6D4' }));
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(database.row?.label_color).toBe('#06B6D4'));
  view.unmount();
  view = render(<Harness />);
  chip = await screen.findByRole('button', { name: /色の確認 自作/ });
  expect(chip).toHaveStyle({ backgroundColor: '#06B6D4' });
  await user.click(chip);
  await user.click(screen.getByRole('button', { name: 'カレンダーの色を使う' }));
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(database.row?.label_color).toBeNull());
  expect(screen.getByRole('button', { name: /色の確認 自作/ })).toHaveStyle({ backgroundColor: '#0072B2' });
  view.unmount();
});
