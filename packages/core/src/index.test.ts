import { describe, expect, it } from 'vitest';
import { CORE_VERSION, formatMinutes } from './index';

describe('@calendar-app/core', () => {
  it('バージョン識別子を公開する', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });

  describe('formatMinutes', () => {
    it('分を「H時間M分」に整形する', () => {
      expect(formatMinutes(0)).toBe('0時間0分');
      expect(formatMinutes(90)).toBe('1時間30分');
      expect(formatMinutes(605)).toBe('10時間5分');
    });

    it('負値や非有限値は拒否する', () => {
      expect(() => formatMinutes(-1)).toThrow(RangeError);
      expect(() => formatMinutes(Number.NaN)).toThrow(RangeError);
    });
  });
});
