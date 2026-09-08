import { describe, expect, it } from 'vitest';
import { selectFeaturedEvents, type FeaturableEvent } from './featured';

const NOW = '2026-09-08T12:00:00Z';

const timed = (
  calendarId: string,
  startsAt: string,
  endsAt: string | null = null,
): FeaturableEvent => ({ calendarId, allDay: false, startsAt, endsAt, eventDate: null });

const allday = (calendarId: string, eventDate: string): FeaturableEvent => ({
  calendarId,
  allDay: true,
  startsAt: null,
  endsAt: null,
  eventDate,
});

/** priority マップからルックアップを作る。未知は最下位相当。 */
const lookup = (m: Record<string, number>) => (id: string) =>
  id in m ? (m[id] as number) : Number.MAX_SAFE_INTEGER;

describe('selectFeaturedEvents / 規則1: 対象は now 以降 / 進行中のみ', () => {
  const p = lookup({ c1: 0 });

  it('過去に終わった時刻付きは除外', () => {
    const past = timed('c1', '2026-09-08T09:00:00Z', '2026-09-08T10:00:00Z');
    expect(selectFeaturedEvents([past], p, NOW, 3)).toEqual([]);
  });

  it('進行中(start < now < end)は含む', () => {
    const ongoing = timed('c1', '2026-09-08T11:30:00Z', '2026-09-08T12:30:00Z');
    expect(selectFeaturedEvents([ongoing], p, NOW, 3)).toEqual([ongoing]);
  });

  it('これから始まる時刻付きは含む', () => {
    const future = timed('c1', '2026-09-08T15:00:00Z', '2026-09-08T16:00:00Z');
    expect(selectFeaturedEvents([future], p, NOW, 3)).toEqual([future]);
  });

  it('endsAt 無し・過去の開始は除外、未来の開始は含む', () => {
    const pastNoEnd = timed('c1', '2026-09-08T11:00:00Z');
    const futureNoEnd = timed('c1', '2026-09-08T13:00:00Z');
    expect(selectFeaturedEvents([pastNoEnd, futureNoEnd], p, NOW, 3)).toEqual([futureNoEnd]);
  });

  it('終日は now の日付以降のみ(今日は含む、過去日は除外)', () => {
    const today = allday('c1', '2026-09-08');
    const yesterday = allday('c1', '2026-09-07');
    const tomorrow = allday('c1', '2026-09-09');
    expect(selectFeaturedEvents([yesterday, today, tomorrow], p, NOW, 5)).toEqual([today, tomorrow]);
  });
});

describe('selectFeaturedEvents / 規則2: 優先度が高いカレンダーが先', () => {
  it('低優先度カレンダーの直近予定より、高優先度カレンダーの後の予定が先', () => {
    const lowSoon = timed('low', '2026-09-08T13:00:00Z', '2026-09-08T14:00:00Z');
    const highLater = timed('high', '2026-09-08T18:00:00Z', '2026-09-08T19:00:00Z');
    const r = selectFeaturedEvents([lowSoon, highLater], lookup({ high: 0, low: 1 }), NOW, 3);
    expect(r.map((e) => e.calendarId)).toEqual(['high', 'low']);
  });
});

describe('selectFeaturedEvents / 規則3: 同カレンダー内は開始時刻順', () => {
  it('同じカレンダーの予定は早い順', () => {
    const late = timed('c1', '2026-09-08T18:00:00Z', '2026-09-08T19:00:00Z');
    const early = timed('c1', '2026-09-08T14:00:00Z', '2026-09-08T15:00:00Z');
    const r = selectFeaturedEvents([late, early], lookup({ c1: 0 }), NOW, 3);
    expect(r).toEqual([early, late]);
  });
});

describe('selectFeaturedEvents / 規則4: 終日は時刻付きの後', () => {
  it('同順位内で終日予定は時刻付きの後に回る', () => {
    const day = allday('c1', '2026-09-08');
    const t = timed('c1', '2026-09-08T20:00:00Z', '2026-09-08T21:00:00Z');
    const r = selectFeaturedEvents([day, t], lookup({ c1: 0 }), NOW, 3);
    expect(r).toEqual([t, day]);
  });

  it('「終日は時刻付きの後」は同順位内の規則 ── 優先度がまず効くので高優先度の終日は低優先度の時刻付きより先', () => {
    const highDay = allday('high', '2026-09-08');
    const lowTimed = timed('low', '2026-09-08T14:00:00Z', '2026-09-08T15:00:00Z');
    const r = selectFeaturedEvents([lowTimed, highDay], lookup({ high: 0, low: 1 }), NOW, 3);
    expect(r.map((e) => e.calendarId)).toEqual(['high', 'low']);
  });
});

describe('selectFeaturedEvents / 規則5: limit で打ち切り', () => {
  it('対象5件・limit 3 なら並べた先頭3件', () => {
    const events = [14, 15, 16, 17, 18].map((h) =>
      timed('c1', `2026-09-08T${h}:00:00Z`, `2026-09-08T${h + 1}:00:00Z`),
    );
    const r = selectFeaturedEvents(events, lookup({ c1: 0 }), NOW, 3);
    expect(r.map((e) => e.startsAt)).toEqual([
      '2026-09-08T14:00:00Z',
      '2026-09-08T15:00:00Z',
      '2026-09-08T16:00:00Z',
    ]);
  });

  it('limit <= 0 は空配列', () => {
    const future = timed('c1', '2026-09-08T15:00:00Z', '2026-09-08T16:00:00Z');
    expect(selectFeaturedEvents([future], lookup({ c1: 0 }), NOW, 0)).toEqual([]);
    expect(selectFeaturedEvents([future], lookup({ c1: 0 }), NOW, -1)).toEqual([]);
  });
});

describe('selectFeaturedEvents / その他', () => {
  it('対象が0件なら空配列', () => {
    const past = timed('c1', '2026-09-08T08:00:00Z', '2026-09-08T09:00:00Z');
    expect(selectFeaturedEvents([past], lookup({ c1: 0 }), NOW, 3)).toEqual([]);
  });

  it('入力配列を破壊しない / 安定ソート(同値は入力順)', () => {
    const a = { ...timed('c1', '2026-09-08T15:00:00Z', '2026-09-08T16:00:00Z'), tag: 'a' };
    const b = { ...timed('c1', '2026-09-08T15:00:00Z', '2026-09-08T16:00:00Z'), tag: 'b' };
    const input = [a, b];
    const r = selectFeaturedEvents(input, lookup({ c1: 0 }), NOW, 3);
    expect(r.map((e) => e.tag)).toEqual(['a', 'b']);
    expect(input).toEqual([a, b]);
  });

  it('呼び出し側の実型を保って返す(title 等が残る)', () => {
    const rich = {
      ...timed('c1', '2026-09-08T15:00:00Z', '2026-09-08T16:00:00Z'),
      id: 'e1',
      title: '打ち合わせ',
    };
    const [first] = selectFeaturedEvents([rich], lookup({ c1: 0 }), NOW, 3);
    expect(first?.title).toBe('打ち合わせ');
    expect(first?.id).toBe('e1');
  });

  it('未知のカレンダーは最下位相当で末尾へ(除外はしない)', () => {
    const known = timed('c1', '2026-09-08T20:00:00Z', '2026-09-08T21:00:00Z');
    const unknown = timed('ghost', '2026-09-08T14:00:00Z', '2026-09-08T15:00:00Z');
    const r = selectFeaturedEvents([unknown, known], lookup({ c1: 0 }), NOW, 3);
    expect(r.map((e) => e.calendarId)).toEqual(['c1', 'ghost']);
  });
});
