import { describe, expect, it } from 'vitest';
import { byPriorityValue, compareEventsForList, type OrderableEvent } from './priority';

const timed = (calendarId: string, startsAt: string): OrderableEvent => ({
  calendarId,
  allDay: false,
  startsAt,
  eventDate: null,
});
const allday = (calendarId: string, eventDate: string): OrderableEvent => ({
  calendarId,
  allDay: true,
  startsAt: null,
  eventDate,
});

/** priority マップからルックアップを作る。未知は最下位相当。 */
const lookup = (m: Record<string, number>) => (id: string) =>
  id in m ? (m[id] as number) : Number.MAX_SAFE_INTEGER;

function sorted(events: OrderableEvent[], priorityOf: (id: string) => number): OrderableEvent[] {
  return [...events].sort((a, b) => compareEventsForList(a, b, priorityOf));
}

describe('byPriorityValue', () => {
  it('priority の昇順', () => {
    expect([{ priority: 2 }, { priority: 0 }, { priority: 1 }].sort(byPriorityValue)).toEqual([
      { priority: 0 },
      { priority: 1 },
      { priority: 2 },
    ]);
  });
});

describe('compareEventsForList', () => {
  it('規則1: 所属カレンダーの優先度が先(時刻に関わらず)', () => {
    const a = timed('low', '2026-09-08T18:00:00Z'); // 優先度0
    const b = timed('high', '2026-09-08T09:00:00Z'); // 優先度1
    const r = sorted([b, a], lookup({ low: 0, high: 1 }));
    expect(r.map((e) => e.calendarId)).toEqual(['low', 'high']);
  });

  it('規則2: 同順位は時刻付き → 終日', () => {
    const t = timed('c1', '2026-09-08T13:00:00Z');
    const a = allday('c1', '2026-09-08');
    expect(sorted([a, t], lookup({ c1: 0 }))).toEqual([t, a]);
  });

  it('規則3: 同順位・両方時刻付きは開始時刻の早い順', () => {
    const early = timed('c1', '2026-09-08T00:00:00Z');
    const late = timed('c1', '2026-09-08T05:00:00Z');
    expect(sorted([late, early], lookup({ c1: 0 }))).toEqual([early, late]);
  });

  it('規則4: 同順位・両方終日は eventDate の早い順', () => {
    const d7 = allday('c1', '2026-09-07');
    const d9 = allday('c1', '2026-09-09');
    expect(sorted([d9, d7], lookup({ c1: 0 }))).toEqual([d7, d9]);
  });

  it('規則5: すべて同値なら 0(安定ソートが入力順を保つ)', () => {
    const x = timed('c1', '2026-09-08T10:00:00Z');
    const y = timed('c1', '2026-09-08T10:00:00Z');
    expect(compareEventsForList(x, y, lookup({ c1: 0 }))).toBe(0);
  });

  it('開始時刻は瞬間で比較する(ISO の書式差 Z / +00:00 / ミリ秒 に左右されない)', () => {
    const zForm = timed('c1', '2026-09-08T09:30:00Z'); // 09:30
    const offsetForm = timed('c1', '2026-09-08T09:00:00.000+00:00'); // 09:00
    expect(sorted([zForm, offsetForm], lookup({ c1: 0 })).map((e) => e.startsAt)).toEqual([
      '2026-09-08T09:00:00.000+00:00',
      '2026-09-08T09:30:00Z',
    ]);
  });

  it('未知のカレンダーは最下位相当(末尾)', () => {
    const known = timed('c1', '2026-09-08T20:00:00Z');
    const unknown = timed('ghost', '2026-09-08T06:00:00Z');
    const r = sorted([unknown, known], lookup({ c1: 0 }));
    expect(r.map((e) => e.calendarId)).toEqual(['c1', 'ghost']);
  });
});
