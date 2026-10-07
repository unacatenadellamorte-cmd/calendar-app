import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeTutorial,
  hasCompletedTutorial,
  TUTORIAL_COMPLETED_KEY,
} from './tutorial-state';

afterEach(() => vi.restoreAllMocks());

describe('初回案内の記録', () => {
  it('未完了から完了を記録できる', () => {
    expect(hasCompletedTutorial()).toBe(false);
    expect(completeTutorial()).toBe(true);
    expect(hasCompletedTutorial()).toBe(true);
    expect(localStorage.getItem(TUTORIAL_COMPLETED_KEY)).toBe('1');
  });
  it('未知の値は完了と誤判定しない', () => {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'false');
    expect(hasCompletedTutorial()).toBe(false);
  });
  it('読み込み禁止でも例外にしない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('保存不可');
    });
    expect(hasCompletedTutorial()).toBe(false);
  });
  it('保存禁止でも例外にせず失敗を返す', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('保存不可');
    });
    expect(completeTutorial()).toBe(false);
  });
});
