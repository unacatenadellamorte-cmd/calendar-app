import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  FEATURED_COUNT_DEFAULT,
  resetFeaturedCountForTests,
  setFeaturedCount,
  useFeaturedCount,
} from './featuredCount';

const KEY = 'calendar-app.featured-count';

beforeEach(() => {
  window.localStorage.clear();
  resetFeaturedCountForTests();
});

describe('featuredCount ストア', () => {
  it('既定は 3', () => {
    const { result } = renderHook(() => useFeaturedCount());
    expect(result.current).toBe(FEATURED_COUNT_DEFAULT);
    expect(FEATURED_COUNT_DEFAULT).toBe(3);
  });

  it('setFeaturedCount で更新し localStorage に保存、購読側へ通知', () => {
    const { result } = renderHook(() => useFeaturedCount());
    act(() => setFeaturedCount(2));
    expect(result.current).toBe(2);
    expect(window.localStorage.getItem(KEY)).toBe('2');
  });

  it('保存済みの値を読み直す', () => {
    window.localStorage.setItem(KEY, '1');
    resetFeaturedCountForTests();
    const { result } = renderHook(() => useFeaturedCount());
    expect(result.current).toBe(1);
  });

  it('範囲外・不正な保存値は既定に落とす', () => {
    for (const bad of ['9', '0', '-1', 'x', '2.5']) {
      window.localStorage.setItem(KEY, bad);
      resetFeaturedCountForTests();
      const { result } = renderHook(() => useFeaturedCount());
      expect(result.current).toBe(FEATURED_COUNT_DEFAULT);
    }
  });

  it('setFeaturedCount は範囲に clamp する', () => {
    const { result } = renderHook(() => useFeaturedCount());
    act(() => setFeaturedCount(99));
    expect(result.current).toBe(3);
    act(() => setFeaturedCount(0));
    expect(result.current).toBe(1);
    act(() => setFeaturedCount(2.6));
    expect(result.current).toBe(3);
  });

  it('localStorage が使えなくても状態は反映する', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    try {
      const { result } = renderHook(() => useFeaturedCount());
      act(() => setFeaturedCount(2));
      expect(result.current).toBe(2);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
