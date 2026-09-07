import { describe, expect, it } from 'vitest';
import type { EventItem } from '@/data/events';
import {
  addDays,
  addMonths,
  eventOccursOnDate,
  groupEventsByDay,
  layoutDayEvents,
  monthGridDays,
  ymd,
} from './calendar-view';

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: 'MTG',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const allDay = (date: string, over: Partial<EventItem> = {}): EventItem =>
  ev({ allDay: true, startsAt: null, endsAt: null, eventDate: date, ...over });

describe('実行環境', () => {
  it('TZ が Asia/Tokyo に固定されている', () => {
    const d = new Date('2026-09-08T15:00:00Z');
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(9);
  });
});

describe('ymd / addDays / addMonths', () => {
  it('ymd は数値に分解する', () => {
    expect(ymd('2026-09-08')).toEqual({ year: 2026, month: 9, day: 8 });
  });

  it('addDays は月をまたぐ', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addMonths は月末をクランプする', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-09-15', 1)).toBe('2026-10-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
});

describe('monthGridDays', () => {
  it('2026年9月は火曜始まりの5週=35セル、前後月のはみ出しを含む', () => {
    const cells = monthGridDays(2026, 9, '2026-09-08');
    expect(cells).toHaveLength(35);
    expect(cells[0]).toMatchObject({ date: '2026-08-30', day: 30, inMonth: false });
    expect(cells[2]).toMatchObject({ date: '2026-09-01', day: 1, inMonth: true });
    expect(cells[34]).toMatchObject({ date: '2026-10-03', inMonth: false });
    expect(cells.find((c) => c.isToday)?.date).toBe('2026-09-08');
    expect(cells.filter((c) => c.isToday)).toHaveLength(1);
  });

  it('2026年2月は日曜始まりの4週=28セル、はみ出しなし', () => {
    const cells = monthGridDays(2026, 2, '2026-01-01');
    expect(cells).toHaveLength(28);
    expect(cells.every((c) => c.inMonth)).toBe(true);
    expect(cells[0]?.date).toBe('2026-02-01');
    expect(cells[27]?.date).toBe('2026-02-28');
  });
});

describe('eventOccursOnDate', () => {
  it('時刻付きは端末ローカルの開始日で判定する(UTC 09-08 15:00 → JST 09-09)', () => {
    const e = ev({ startsAt: '2026-09-08T15:00:00Z', endsAt: '2026-09-08T16:00:00Z' });
    expect(eventOccursOnDate(e, '2026-09-09')).toBe(true);
    expect(eventOccursOnDate(e, '2026-09-08')).toBe(false);
  });

  it('終日は eventDate で判定する', () => {
    expect(eventOccursOnDate(allDay('2026-09-07'), '2026-09-07')).toBe(true);
    expect(eventOccursOnDate(allDay('2026-09-07'), '2026-09-08')).toBe(false);
  });
});

describe('groupEventsByDay', () => {
  it('出現日ごとにまとめ、時刻付き→終日・開始時刻順に並べる', () => {
    const early = ev({ id: 'a', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-08T01:00:00Z' }); // JST 09:00
    const late = ev({ id: 'b', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' }); // JST 14:00
    const holiday = allDay('2026-09-08', { id: 'c' });
    const other = ev({ id: 'd', startsAt: '2026-09-09T01:00:00Z', endsAt: '2026-09-09T02:00:00Z' });

    const map = groupEventsByDay([late, holiday, early, other]);
    expect([...map.keys()].sort()).toEqual(['2026-09-08', '2026-09-09']);
    expect(map.get('2026-09-08')?.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(map.get('2026-09-09')?.map((e) => e.id)).toEqual(['d']);
  });
});

describe('layoutDayEvents', () => {
  it('重なる時刻付き予定を列に分割する(開始時刻順で左詰め)', () => {
    const a = ev({ id: 'a', startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z' }); // 10:00-11:00
    const b = ev({ id: 'b', startsAt: '2026-09-08T01:30:00Z', endsAt: '2026-09-08T02:30:00Z' }); // 10:30-11:30
    const positioned = layoutDayEvents([b, a]);
    const byId = new Map(positioned.map((p) => [p.event.id, p]));
    expect(byId.get('a')).toMatchObject({ column: 0, columnCount: 2, startMin: 600, endMin: 660 });
    expect(byId.get('b')).toMatchObject({ column: 1, columnCount: 2, startMin: 630, endMin: 690 });
  });

  it('重ならない予定は独立グループ(columnCount=1)', () => {
    const a = ev({ id: 'a', startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z' });
    const c = ev({ id: 'c', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' });
    const positioned = layoutDayEvents([a, c]);
    expect(positioned.find((p) => p.event.id === 'c')).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('終日予定は無視する', () => {
    expect(layoutDayEvents([allDay('2026-09-08')])).toEqual([]);
  });
});
