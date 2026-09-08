import { describe, expect, it } from 'vitest';
import { monthlyPayEstimate, workedMinutes, type PayableShift } from './pay';

describe('workedMinutes', () => {
  it('通常シフト: 終了 − 開始', () => {
    expect(workedMinutes('2026-09-08T09:00:00Z', '2026-09-08T17:00:00Z', 0)).toBe(480);
  });

  it('休憩を控除する', () => {
    expect(workedMinutes('2026-09-08T09:00:00Z', '2026-09-08T17:00:00Z', 60)).toBe(420);
  });

  it('日またぎ: 同日 ISO で終了 < 開始なら終了を +24h して通算', () => {
    // 22:00Z → 翌 06:00 相当。16h - 休憩1h = 900分。
    expect(workedMinutes('2026-09-08T13:00:00Z', '2026-09-08T05:00:00Z', 60)).toBe(900);
  });

  it('日またぎ: 正しい timestamp(終了 > 開始)なら +24h しない', () => {
    expect(workedMinutes('2026-09-08T13:00:00Z', '2026-09-09T05:00:00Z', 60)).toBe(900);
  });

  it('開始と終了が同時刻なら 24h 扱い', () => {
    expect(workedMinutes('2026-09-08T10:00:00Z', '2026-09-08T10:00:00Z', 0)).toBe(1440);
  });

  it('休憩が実働以上でも負のまま返す(クランプしない)', () => {
    expect(workedMinutes('2026-09-08T09:00:00Z', '2026-09-08T10:00:00Z', 120)).toBe(-60);
  });

  it('ISO の書式差(Z / +00:00 / ミリ秒)に左右されない', () => {
    expect(
      workedMinutes('2026-09-08T09:00:00.000+00:00', '2026-09-08T17:30:00Z', 30),
    ).toBe(480);
  });
});

describe('monthlyPayEstimate', () => {
  const shift = (
    startsAt: string,
    endsAt: string,
    breakMinutes: number,
    hourlyWage: number,
  ): PayableShift => ({ startsAt, endsAt, breakMinutes, hourlyWage });

  it('実働7h @¥1100 を2件で 15,400 円', () => {
    const s = shift('2026-09-08T00:00:00Z', '2026-09-08T08:00:00Z', 60, 1100); // 7h
    const r = monthlyPayEstimate([s, { ...s, startsAt: '2026-09-09T00:00:00Z', endsAt: '2026-09-09T08:00:00Z' }]);
    expect(r).toEqual({ amount: 15400, shiftCount: 2, workedMinutes: 840 });
  });

  it('時給差を合算する(5h@1000 + 4h@1200 = 9,800)', () => {
    const r = monthlyPayEstimate([
      shift('2026-09-08T00:00:00Z', '2026-09-08T05:00:00Z', 0, 1000),
      shift('2026-09-09T00:00:00Z', '2026-09-09T04:00:00Z', 0, 1200),
    ]);
    expect(r.amount).toBe(9800);
  });

  it('休憩過大のシフトは寄与0(マイナスにしない)', () => {
    const r = monthlyPayEstimate([shift('2026-09-08T00:00:00Z', '2026-09-08T01:00:00Z', 120, 1000)]);
    expect(r.amount).toBe(0);
    expect(r.workedMinutes).toBe(0);
    expect(r.shiftCount).toBe(1);
  });

  it('0件は amount 0', () => {
    expect(monthlyPayEstimate([])).toEqual({ amount: 0, shiftCount: 0, workedMinutes: 0 });
  });

  it('日またぎシフト(同日 ISO で end < start)は +24h 通算で計算する', () => {
    // 13:00Z → 翌 05:00Z(end <= start で +24h)= 16h span、休憩1h → 実働15h @ ¥1200 = 18,000。
    const r = monthlyPayEstimate([shift('2026-09-08T13:00:00Z', '2026-09-08T05:00:00Z', 60, 1200)]);
    expect(r.amount).toBe(18000);
  });

  it('端数は合算後に丸める', () => {
    // 90分 @ ¥1001 → 1501.5 → 1件だけなら round(1501.5) = 1502。
    const r = monthlyPayEstimate([shift('2026-09-08T00:00:00Z', '2026-09-08T01:30:00Z', 0, 1001)]);
    expect(r.amount).toBe(1502);
  });
});
