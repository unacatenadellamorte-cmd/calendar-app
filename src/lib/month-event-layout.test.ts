import { describe, expect, it } from 'vitest';
import type { EventItem } from '@/data/events';
import { addDays, groupEventsByDay, monthGridDays } from './calendar-view';
import { layoutMonthEventSlots } from './month-event-layout';

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'night', calendarId: 'shift', title: '夜勤', source: 'local', allDay: false,
  startsAt: new Date('2026-09-08T22:00').toISOString(),
  endsAt: new Date('2026-09-09T06:00').toISOString(),
  eventDate: null, note: null, breakMinutes: 60, hourlyWage: 1200,
  workplaceLabel: null, shiftTemplateId: 't1', reminderMinutes: null,
  isSecret: false, createdAt: '', updatedAt: '', ...over,
});
const dates = monthGridDays(2026, 9, '2026-09-08').map((cell) => cell.date);

describe('月表示の連続した予定の段', () => {
  it('前日の別予定の有無に左右されず、夜勤を同じ段でつなぐ', () => {
    const night = event();
    const daytime = event({ id: 'day', startsAt: new Date('2026-09-08T09:00').toISOString(), endsAt: new Date('2026-09-08T10:00').toISOString() });
    const layout = layoutMonthEventSlots(dates, groupEventsByDay([daytime, night]), 3);
    const before = layout.get('2026-09-08')!;
    const after = layout.get('2026-09-09')!;
    const lane = before.findIndex((slot) => slot?.event.id === 'night');
    expect(before[lane]).toMatchObject({ joinedBefore: false, joinedAfter: true });
    expect(after[lane]).toMatchObject({ event: { id: 'night' }, joinedBefore: true, joinedAfter: false });
  });
  it('0時終了は翌日の帯につなげず、同名の別勤務もつなげない', () => {
    const first = event({ endsAt: new Date('2026-09-09T00:00').toISOString() });
    const second = event({ id: 'other', startsAt: new Date('2026-09-09T22:00').toISOString(), endsAt: new Date('2026-09-10T06:00').toISOString() });
    const layout = layoutMonthEventSlots(dates, groupEventsByDay([first, second]), 3);
    expect(layout.get('2026-09-08')![0]).toMatchObject({ joinedAfter: false, continuesAfter: false });
    expect(layout.get('2026-09-09')!.some((slot) => slot?.event.id === first.id)).toBe(false);
    expect(layout.get('2026-09-09')![0]).toMatchObject({ joinedBefore: false });
  });
  it('土曜から日曜は横につながず、週をまたぐ継続を示す', () => {
    const night = event({ startsAt: new Date('2026-09-12T22:00').toISOString(), endsAt: new Date('2026-09-13T06:00').toISOString() });
    const layout = layoutMonthEventSlots(dates, groupEventsByDay([night]), 3);
    expect(layout.get('2026-09-12')![0]).toMatchObject({ joinedAfter: false, continuesAfter: true });
    expect(layout.get('2026-09-13')![0]).toMatchObject({ joinedBefore: false, continuesBefore: true });
  });
  it('月境界・折りたたみ週・終日予定も排他的終了日でつなぐ', () => {
    const holiday = event({ allDay: true, startsAt: null, endsAt: null, eventDate: '2026-09-30', eventEndDate: '2026-10-02' });
    const week = Array.from({ length: 7 }, (_, i) => addDays('2026-09-27', i));
    const layout = layoutMonthEventSlots(week, groupEventsByDay([holiday]), 3);
    expect(layout.get('2026-09-30')![0]?.joinedAfter).toBe(true);
    expect(layout.get('2026-10-01')![0]?.joinedBefore).toBe(true);
    expect(layout.get('2026-10-02')).toEqual([]);
  });
  it('日またぎ予定は上位3件の枠外でも段を増やしてつなぐ', () => {
    const night = event();
    const high = ['a', 'b', 'c'].map((id) => event({ id }));
    const byDay = new Map([
      ['2026-09-08', [night]],
      ['2026-09-09', [...high, night]],
    ]);
    const layout = layoutMonthEventSlots(dates, byDay, 3);
    const lane = layout.get('2026-09-08')!.findIndex((slot) => slot?.event.id === night.id);
    expect(layout.get('2026-09-08')![lane]).toMatchObject({ joinedAfter: true, continuesAfter: true });
    expect(layout.get('2026-09-09')![lane]?.joinedBefore).toBe(true);
    expect(layout.get('2026-09-09')!.filter(Boolean).map((slot) => slot!.event.id).sort()).toEqual(['a', 'b', 'c', 'night']);
    expect(layout.get('2026-09-10')).toEqual([]);
  });
  it('ゴミの日→予定→シフトの順で、翌日の可燃ごみの下へシフトの帯を通す', () => {
    const priority = (id: string) => ({ garbage: 0, plans: 1, shift: 2 })[id] ?? 99;
    const garbage = (id: string, date: string) => event({ id, calendarId: 'garbage', title: '可燃ごみ', allDay: true, eventDate: date, startsAt: null, endsAt: null });
    const night = event({ startsAt: new Date('2026-09-02T22:00').toISOString(), endsAt: new Date('2026-09-03T06:00').toISOString() });
    const layout = layoutMonthEventSlots(dates, groupEventsByDay([garbage('g1', '2026-09-01'), night, garbage('g3', '2026-09-03')], priority), 3, priority);
    expect(layout.get('2026-09-02')!.map((slot) => slot?.event.id ?? null)).toEqual([null, 'night']);
    expect(layout.get('2026-09-03')!.map((slot) => slot?.event.id ?? null)).toEqual(['g3', 'night']);
    expect(layout.get('2026-09-02')![1]?.joinedAfter).toBe(true);
    expect(layout.get('2026-09-03')![1]?.joinedBefore).toBe(true);
  });
  it('予定3件＋夜勤は夜勤を4段目で翌日へつなぎ、通常予定だけなら3件上限を保つ', () => {
    const priority = (id: string) => id === 'plans' ? 0 : 1;
    const plans = ['a', 'b', 'c', 'd'].map((id) => event({ id, calendarId: 'plans', title: id, allDay: true, eventDate: '2026-09-08', startsAt: null, endsAt: null }));
    const night = event();
    const layout = layoutMonthEventSlots(dates, groupEventsByDay([...plans, night], priority), 3, priority);
    expect(layout.get('2026-09-08')!.map((slot) => slot?.event.id ?? null)).toEqual(['a', 'b', 'c', 'night']);
    expect(layout.get('2026-09-09')!.map((slot) => slot?.event.id ?? null)).toEqual([null, null, null, 'night']);
  });
});
