import { describe, expect, it } from 'vitest';
import { MAX_SHIFT_RATIO, canRefractBackdrop, displacementScale, maxVisualShift, refractionBand } from './glassRefraction';

const supportsAll = () => true;
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';

describe('canRefractBackdrop', () => {
  it('Chromium系(Android WebView)だけ背景の実変位を使う', () => {
    expect(canRefractBackdrop({ userAgent: ANDROID_WEBVIEW, maxTouchPoints: 5 }, supportsAll)).toBe(true);
  });

  it('iOS/iPadOSはCSS構文を受け付けても対象外(WebKitは背景を変位しない)', () => {
    expect(canRefractBackdrop({ userAgent: IPHONE, maxTouchPoints: 5 }, supportsAll)).toBe(false);
    expect(canRefractBackdrop({ userAgent: IOS_CHROME, maxTouchPoints: 5 }, supportsAll)).toBe(false);
    expect(canRefractBackdrop({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }, supportsAll)).toBe(false);
  });

  it('backdrop-filterのurl()非対応・判定手段なしではfallback', () => {
    expect(canRefractBackdrop({ userAgent: ANDROID_WEBVIEW, maxTouchPoints: 5 }, () => false)).toBe(false);
    expect(canRefractBackdrop(undefined, supportsAll)).toBe(false);
    expect(canRefractBackdrop({ userAgent: ANDROID_WEBVIEW, maxTouchPoints: 5 }, undefined)).toBe(false);
  });
});

describe('変位量', () => {
  it('強さ0で変位なし、中間は連続、最大でも断面の傾きで背景が折り返さない', () => {
    const band = refractionBand(340, 120);
    expect(displacementScale(0, band)).toBe(0);
    expect(displacementScale(0.5, band)).toBeGreaterThan(0);
    expect(displacementScale(0.5, band)).toBeCloseTo(displacementScale(1, band) / 2, 0);
    expect(displacementScale(Number.NaN, band)).toBe(0);
    expect(displacementScale(3, band)).toBe(displacementScale(1, band));
    // 断面 (1+cos πt)/2 の最大傾き π/2 × 変位/帯幅 < 1 なら単調(折り返さない)。
    expect((Math.PI / 2) * (maxVisualShift(displacementScale(1, band)) / band)).toBeLessThan(1);
    expect(MAX_SHIFT_RATIO).toBeLessThan(2 / Math.PI);
  });

  it('強さ100の見た目の変位は旧版(帯幅最大30px・0.45倍)より明確に大きい', () => {
    // 旧版: band=min(30,max(8,短辺×0.24))、最大変位≒0.448×band。
    const oldShift = (w: number, h: number) => 0.448 * Math.round(Math.min(30, Math.max(8, Math.min(w, h) * 0.24)));
    for (const [w, h] of [[358, 420], [340, 120], [64, 44]] as const) {
      const now = maxVisualShift(displacementScale(1, refractionBand(w, h)));
      expect(now).toBeGreaterThan(oldShift(w, h) * 1.6);
    }
  });

  it('小さな面ほど縁の帯を細くし、中央の平らな読みやすい部分を残す', () => {
    expect(refractionBand(340, 44)).toBeLessThan(refractionBand(340, 200));
    expect(refractionBand(340, 44) * 2).toBeLessThan(44);
    expect(refractionBand(2000, 2000)).toBe(48);
  });
});
