import { describe, expect, it } from 'vitest';
import { normalizeDeviceEvent, toDeviceEventRow } from './device-events';

describe('normalizeDeviceEvent', () => {
  it('id が無ければ null', () => {
    expect(normalizeDeviceEvent({ title: 'x', startDate: Date.now() })).toBeNull();
  });

  it('startDate が無い/不正なら null', () => {
    expect(normalizeDeviceEvent({ id: 'e1', title: 'x' })).toBeNull();
    expect(normalizeDeviceEvent({ id: 'e1', title: 'x', startDate: NaN })).toBeNull();
  });

  it('startDate が Date の有効範囲外(Infinity・桁外れ)なら null(RangeError を投げない)', () => {
    expect(() =>
      normalizeDeviceEvent({ id: 'e1', title: 'x', isAllDay: true, startDate: Infinity }),
    ).not.toThrow();
    expect(normalizeDeviceEvent({ id: 'e1', title: 'x', isAllDay: true, startDate: Infinity })).toBeNull();
    expect(
      normalizeDeviceEvent({ id: 'e1', title: 'x', isAllDay: false, startDate: 9_000_000_000_000_000 }),
    ).toBeNull();
  });

  it('endDate が Date の有効範囲外なら開始に丸める(RangeError を投げない)', () => {
    const start = Date.UTC(2026, 8, 15, 10, 0, 0);
    expect(() =>
      normalizeDeviceEvent({ id: 'e1', title: 'x', isAllDay: false, startDate: start, endDate: Infinity }),
    ).not.toThrow();
    const n = normalizeDeviceEvent({
      id: 'e1',
      title: 'x',
      isAllDay: false,
      startDate: start,
      endDate: 9_000_000_000_000_000,
    });
    expect(n?.endsAt).toBe(n?.startsAt);
  });

  it('終日: isAllDay=true なら startDate をローカル日付の event_date に、時刻は null', () => {
    // vitest は TZ=Asia/Tokyo 固定(vite.config.ts)。2026-09-15T00:00:00+09:00 = UTC 2026-09-14T15:00:00Z。
    const startMs = Date.UTC(2026, 8, 14, 15, 0, 0);
    const n = normalizeDeviceEvent({ id: 'e1', title: 'ゴミ', isAllDay: true, startDate: startMs });
    expect(n).toMatchObject({
      externalId: 'e1',
      title: 'ゴミ',
      allDay: true,
      startsAt: null,
      endsAt: null,
      eventDate: '2026-09-15',
    });
  });

  it('終日の日付はローカルタイムゾーン基準(toISOString の UTC 日付とはずれ得る)', () => {
    // UTC では 9/14 だが、ローカル(JST, +9h)では 9/15 になる境界値。
    // toISOString()ベースだと '2026-09-14' になってしまうところを、
    // ローカル getter を使うことで '2026-09-15' になることを確認する(Design Notes)。
    const startMs = Date.UTC(2026, 8, 14, 15, 0, 0);
    expect(new Date(startMs).toISOString().slice(0, 10)).toBe('2026-09-14');
    const n = normalizeDeviceEvent({ id: 'e1', title: 'x', isAllDay: true, startDate: startMs });
    expect(n?.eventDate).toBe('2026-09-15');
  });

  it('時刻付き: starts/ends を UTC ISO で保存', () => {
    const start = Date.UTC(2026, 8, 15, 1, 0, 0);
    const end = Date.UTC(2026, 8, 15, 2, 0, 0);
    const n = normalizeDeviceEvent({
      id: 'e2',
      title: '会議',
      isAllDay: false,
      startDate: start,
      endDate: end,
    });
    expect(n).toMatchObject({
      externalId: 'e2',
      allDay: false,
      startsAt: '2026-09-15T01:00:00.000Z',
      endsAt: '2026-09-15T02:00:00.000Z',
      eventDate: null,
    });
  });

  it('endDate が無い時刻付きは開始に合わせる(starts_at <= ends_at を保証)', () => {
    const start = Date.UTC(2026, 8, 15, 10, 0, 0);
    const n = normalizeDeviceEvent({ id: 'e3', title: 'x', isAllDay: false, startDate: start });
    expect(n?.startsAt).toBe('2026-09-15T10:00:00.000Z');
    expect(n?.endsAt).toBe('2026-09-15T10:00:00.000Z');
  });

  it('endDate < startDate の異常データも開始に丸める', () => {
    const start = Date.UTC(2026, 8, 15, 10, 0, 0);
    const end = Date.UTC(2026, 8, 15, 9, 0, 0);
    const n = normalizeDeviceEvent({ id: 'e4', title: 'x', isAllDay: false, startDate: start, endDate: end });
    expect(n?.endsAt).toBe(n?.startsAt);
  });

  it('title 空はプレースホルダ、長すぎは 200 文字に切る', () => {
    expect(
      normalizeDeviceEvent({ id: 'e5', isAllDay: true, startDate: Date.now() })?.title,
    ).toBe('(タイトルなし)');
    const long = 'あ'.repeat(300);
    expect(
      normalizeDeviceEvent({ id: 'e6', title: long, isAllDay: true, startDate: Date.now() })?.title,
    ).toHaveLength(200);
  });

  it('description を note に(空/null は null、長すぎは 2000 文字)', () => {
    expect(
      normalizeDeviceEvent({
        id: 'e7',
        title: 'x',
        description: '  メモ  ',
        isAllDay: true,
        startDate: Date.now(),
      })?.note,
    ).toBe('メモ');
    expect(
      normalizeDeviceEvent({ id: 'e8', title: 'x', description: null, isAllDay: true, startDate: Date.now() })
        ?.note,
    ).toBeNull();
    const long = 'x'.repeat(3000);
    expect(
      normalizeDeviceEvent({
        id: 'e9',
        title: 'x',
        description: long,
        isAllDay: true,
        startDate: Date.now(),
      })?.note,
    ).toHaveLength(2000);
  });
});

describe('toDeviceEventRow', () => {
  it('camelCase を DB 行(snake_case)へ写す', () => {
    const n = normalizeDeviceEvent({
      id: 'e1',
      title: '会議',
      description: 'メモ',
      isAllDay: false,
      startDate: Date.UTC(2026, 8, 15, 10, 0, 0),
      endDate: Date.UTC(2026, 8, 15, 11, 0, 0),
    })!;
    expect(toDeviceEventRow(n)).toEqual({
      external_id: 'e1',
      title: '会議',
      note: 'メモ',
      all_day: false,
      starts_at: '2026-09-15T10:00:00.000Z',
      ends_at: '2026-09-15T11:00:00.000Z',
      event_date: null,
    });
  });

  it('終日は starts_at/ends_at が null、event_date が入る', () => {
    const n = normalizeDeviceEvent({
      id: 'e2',
      title: 'ゴミ',
      isAllDay: true,
      startDate: Date.UTC(2026, 8, 15, 0, 0, 0),
    })!;
    expect(toDeviceEventRow(n)).toMatchObject({
      all_day: true,
      starts_at: null,
      ends_at: null,
      event_date: '2026-09-15',
    });
  });
});
