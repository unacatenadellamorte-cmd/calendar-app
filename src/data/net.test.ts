import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNetworkError, isOffline } from './net';

afterEach(() => vi.unstubAllGlobals());

describe('isOffline', () => {
  it('navigator.onLine === false のときだけ true', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(isOffline()).toBe(false);
    vi.stubGlobal('navigator', { onLine: false });
    expect(isOffline()).toBe(true);
  });
});

describe('isNetworkError', () => {
  it('オフラインなら常に true', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isNetworkError(null)).toBe(true);
  });

  it('オンラインで fetch 失敗のシグネチャを拾う', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkError({ message: 'Load failed' })).toBe(true);
  });

  it('業務エラー(RLS・制約違反)は false', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false);
    expect(isNetworkError({ message: 'boom', code: '23514' })).toBe(false);
  });
});
