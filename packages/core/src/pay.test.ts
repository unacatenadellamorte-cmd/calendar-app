import { describe, expect, it } from 'vitest';
import { workedMinutes } from './pay';

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
