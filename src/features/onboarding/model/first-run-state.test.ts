import { expect, it, vi } from 'vitest';
import { firstRunKey, readFirstRunStage, saveFirstRunStage } from './first-run-state';

it('利用者別の全段階を保存し、他の利用者へ持ち越さない', () => {
  for (const stage of ['google', 'profile', 'tutorial', 'done'] as const) {
    saveFirstRunStage('u1', stage);
    expect(readFirstRunStage('u1')).toBe(stage);
    expect(readFirstRunStage('u2')).toBeNull();
  }
});

it('不正な段階と利用者なしは採用せず、認証情報を保存しない', () => {
  localStorage.setItem(firstRunKey('u1'), 'https://example.invalid');
  expect(readFirstRunStage('u1')).toBeNull();
  saveFirstRunStage(null, 'profile');
  expect(readFirstRunStage(null)).toBeNull();
  expect(firstRunKey('a/b')).not.toBe(firstRunKey('a%2Fb'));
});

it('端末の読取・保存が禁止されても例外を出さない', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('読取不可');
  });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('保存不可');
  });
  try {
    expect(readFirstRunStage('u1')).toBeNull();
    expect(() => saveFirstRunStage('u1', 'google')).not.toThrow();
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});
