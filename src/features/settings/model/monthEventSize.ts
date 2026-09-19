import { useCallback, useEffect, useState } from 'react';

export type MonthEventSize = 'small' | 'medium' | 'large';

const STORAGE_KEY = 'calendar-app.month-event-size';
const CSS_VALUES: Record<MonthEventSize, string> = {
  small: '8px',
  medium: '10px',
  large: '12px',
};
const VALID: readonly MonthEventSize[] = ['small', 'medium', 'large'];

export function readStoredMonthEventSize(): MonthEventSize {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return VALID.includes(value as MonthEventSize) ? (value as MonthEventSize) : 'small';
  } catch {
    return 'small';
  }
}

export function applyMonthEventSize(size: MonthEventSize): void {
  document.documentElement.style.setProperty('--month-event-font-size', CSS_VALUES[size]);
}

export function initMonthEventSize(): void {
  applyMonthEventSize(readStoredMonthEventSize());
}

export function useMonthEventSize(): {
  monthEventSize: MonthEventSize;
  setMonthEventSize: (next: MonthEventSize) => void;
} {
  const [monthEventSize, setState] = useState<MonthEventSize>(() => readStoredMonthEventSize());
  useEffect(() => applyMonthEventSize(monthEventSize), [monthEventSize]);
  const setMonthEventSize = useCallback((next: MonthEventSize) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても、このセッションの表示は更新する。
    }
  }, []);
  return { monthEventSize, setMonthEventSize };
}
