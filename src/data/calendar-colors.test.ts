import { describe, expect, it } from 'vitest';
import { EXTERNAL_DEFAULT_COLOR, normalizeHexColor } from './calendar-colors';

describe('normalizeHexColor', () => {
  it('#RRGGBB はそのまま大文字化', () => {
    expect(normalizeHexColor('#4285f4')).toBe('#4285F4');
    expect(normalizeHexColor('#ABCDEF')).toBe('#ABCDEF');
  });

  it('#RGB は各桁を2倍に展開', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor('#0f0')).toBe('#00FF00');
  });

  it('前後の空白を無視', () => {
    expect(normalizeHexColor('  #123456 ')).toBe('#123456');
  });

  it('名前付き色 / rgb() / 空 / null / undefined は既定色', () => {
    expect(normalizeHexColor('red')).toBe(EXTERNAL_DEFAULT_COLOR);
    expect(normalizeHexColor('rgb(1,2,3)')).toBe(EXTERNAL_DEFAULT_COLOR);
    expect(normalizeHexColor('#12345')).toBe(EXTERNAL_DEFAULT_COLOR);
    expect(normalizeHexColor('')).toBe(EXTERNAL_DEFAULT_COLOR);
    expect(normalizeHexColor(null)).toBe(EXTERNAL_DEFAULT_COLOR);
    expect(normalizeHexColor(undefined)).toBe(EXTERNAL_DEFAULT_COLOR);
  });

  it('戻り値は必ず calendars.color の CHECK(^#[0-9A-Fa-f]{6}$)を満たす', () => {
    for (const input of ['#abc', '#4285F4', 'nonsense', '#xyz', null]) {
      expect(normalizeHexColor(input)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
