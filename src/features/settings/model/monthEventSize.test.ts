import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMonthEventSize,
  initMonthEventSize,
  readStoredMonthEventSize,
  useMonthEventSize,
} from './monthEventSize';
import { renderHook, act } from '@testing-library/react';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty('--month-event-font-size');
});

describe('monthEventSize', () => {
  it('既定値は小で、不正値も小へ戻る', () => {
    expect(readStoredMonthEventSize()).toBe('small');
    window.localStorage.setItem('calendar-app.month-event-size', 'invalid');
    expect(readStoredMonthEventSize()).toBe('small');
  });

  it.each([
    ['small', '8px'],
    ['medium', '10px'],
    ['large', '12px'],
  ] as const)('%s を CSS 変数へ反映する', (size, cssValue) => {
    applyMonthEventSize(size);
    expect(document.documentElement.style.getPropertyValue('--month-event-font-size')).toBe(cssValue);
  });

  it('設定を保存し、起動時に保存値を復元する', () => {
    const { result } = renderHook(() => useMonthEventSize());
    act(() => result.current.setMonthEventSize('large'));
    expect(window.localStorage.getItem('calendar-app.month-event-size')).toBe('large');
    expect(result.current.monthEventSize).toBe('large');
    document.documentElement.style.removeProperty('--month-event-font-size');
    initMonthEventSize();
    expect(document.documentElement.style.getPropertyValue('--month-event-font-size')).toBe('12px');
  });
});
