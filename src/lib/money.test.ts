import { describe, expect, it } from 'vitest';
import { formatYen } from './money';

describe('formatYen', () => {
  it('3桁区切りで ¥ を付ける', () => {
    expect(formatYen(62700)).toBe('¥62,700');
    expect(formatYen(0)).toBe('¥0');
    expect(formatYen(1000000)).toBe('¥1,000,000');
  });

  it('小数は四捨五入する', () => {
    expect(formatYen(1501.5)).toBe('¥1,502');
  });
});
