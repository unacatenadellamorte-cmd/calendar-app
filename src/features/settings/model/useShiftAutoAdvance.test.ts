import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readStoredShiftAutoAdvance,
  resetShiftAutoAdvanceForTests,
  SHIFT_AUTO_ADVANCE_STORAGE_KEY,
  useShiftAutoAdvance,
} from './useShiftAutoAdvance';

beforeEach(() => {
  window.localStorage.clear();
  resetShiftAutoAdvanceForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('useShiftAutoAdvance', () => {
  it('既定値は false で、不正値も false にする', () => {
    expect(readStoredShiftAutoAdvance()).toBe(false);
    window.localStorage.setItem(SHIFT_AUTO_ADVANCE_STORAGE_KEY, 'invalid');
    expect(readStoredShiftAutoAdvance()).toBe(false);
  });

  it('設定を保存し、再読込み時に復元する', () => {
    const { result, unmount } = renderHook(() => useShiftAutoAdvance());
    act(() => result.current.setShiftAutoAdvance(true));
    expect(result.current.shiftAutoAdvance).toBe(true);
    expect(window.localStorage.getItem(SHIFT_AUTO_ADVANCE_STORAGE_KEY)).toBe('true');
    unmount();
    const reloaded = renderHook(() => useShiftAutoAdvance());
    expect(reloaded.result.current.shiftAutoAdvance).toBe(true);
  });

  it('false も保存する', () => {
    const { result } = renderHook(() => useShiftAutoAdvance());
    act(() => result.current.setShiftAutoAdvance(true));
    act(() => result.current.setShiftAutoAdvance(false));
    expect(window.localStorage.getItem(SHIFT_AUTO_ADVANCE_STORAGE_KEY)).toBe('false');
    expect(result.current.shiftAutoAdvance).toBe(false);
  });

  it('同時に購読する別の画面にも変更を反映する', () => {
    const first = renderHook(() => useShiftAutoAdvance());
    const second = renderHook(() => useShiftAutoAdvance());
    act(() => first.result.current.setShiftAutoAdvance(true));
    expect(second.result.current.shiftAutoAdvance).toBe(true);
    act(() => second.result.current.setShiftAutoAdvance(false));
    expect(first.result.current.shiftAutoAdvance).toBe(false);
  });

  it('保存失敗後も画面移動先で設定を保持する', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('保存不可'); });
    const first = renderHook(() => useShiftAutoAdvance());
    act(() => first.result.current.setShiftAutoAdvance(true));
    expect(window.localStorage.getItem(SHIFT_AUTO_ADVANCE_STORAGE_KEY)).toBeNull();
    first.unmount();
    const next = renderHook(() => useShiftAutoAdvance());
    expect(next.result.current.shiftAutoAdvance).toBe(true);
  });

  it('別タブの変更・削除・全消去を同期し、無関係なキーとsessionStorageは無視する', () => {
    const { result } = renderHook(() => useShiftAutoAdvance());
    const emit = (key: string | null, newValue: string | null, storageArea = window.localStorage) => {
      act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea })));
    };
    emit(SHIFT_AUTO_ADVANCE_STORAGE_KEY, 'true');
    expect(result.current.shiftAutoAdvance).toBe(true);
    emit('unrelated', 'false');
    emit(SHIFT_AUTO_ADVANCE_STORAGE_KEY, 'false', window.sessionStorage);
    expect(result.current.shiftAutoAdvance).toBe(true);
    emit(SHIFT_AUTO_ADVANCE_STORAGE_KEY, null);
    expect(result.current.shiftAutoAdvance).toBe(false);
    emit(SHIFT_AUTO_ADVANCE_STORAGE_KEY, 'true');
    emit(null, null);
    expect(result.current.shiftAutoAdvance).toBe(false);
  });
});
