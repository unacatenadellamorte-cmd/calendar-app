import { describe, expect, it } from 'vitest';
import { getCropGeometry } from './cropGeometry';

describe('背景画像の切り出し範囲', () => {
  it('縦長画像でも枠を空白なしで満たす', () => {
    const crop = getCropGeometry(1000, 2000, 1.5, { zoom: 1, x: 0, y: 0 });
    expect(crop.width / crop.height).toBeCloseTo(1.5);
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBeCloseTo(666.666, 2);
  });
  it('拡大と移動を画像の境界内に収める', () => {
    const crop = getCropGeometry(1600, 900, 1, { zoom: 2, x: 9, y: -9 });
    expect(crop.sx).toBeGreaterThanOrEqual(0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
    expect(crop.sx + crop.width).toBeLessThanOrEqual(1600);
    expect(crop.sy + crop.height).toBeLessThanOrEqual(900);
  });
  it('小さい画像でも切り出し範囲を画像外へ出さない', () => {
    const crop = getCropGeometry(200, 100, 3, { zoom: 1, x: 1, y: 1 });
    expect(crop).toEqual({
      sx: 0,
      sy: 33.33333333333333,
      width: 200,
      height: 66.66666666666667,
    });
  });
});
