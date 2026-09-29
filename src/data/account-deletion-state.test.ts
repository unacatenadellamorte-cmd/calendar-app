import { afterEach, expect, it, vi } from 'vitest';
import { ACCOUNT_DELETION_KEY, isAccountDataBlocked, readDeletion, startAfterDeletion, subscribeDeletion, writeDeletion } from './account-deletion-state';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('別タブの記録作成を購読し、削除キー消去時は再読込する', () => {
  const reload = vi.fn();
  const actualWindow = window;
  vi.stubGlobal('window', new Proxy(actualWindow, { get: (target, key) => key === 'location' ? { reload } : Reflect.get(target, key, target) }));
  const listener = vi.fn();
  const stop = subscribeDeletion(listener);
  const record = JSON.stringify({ userId: '本人', phase: 'remote' });
  localStorage.setItem(ACCOUNT_DELETION_KEY, record);
  window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_DELETION_KEY, newValue: record }));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(isAccountDataBlocked()).toBe(true);
  localStorage.removeItem(ACCOUNT_DELETION_KEY);
  window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_DELETION_KEY, oldValue: record }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(isAccountDataBlocked()).toBe(true);
  stop();
});

it('完了していない削除記録は明示的な再開操作でも消さない', () => {
  const replace = vi.fn();
  const actualWindow = window;
  vi.stubGlobal('window', new Proxy(actualWindow, { get: (target, key) => key === 'location' ? { replace } : Reflect.get(target, key, target) }));
  writeDeletion({ userId: '本人', phase: 'local' });
  startAfterDeletion();
  expect(readDeletion()?.phase).toBe('local');
  expect(replace).not.toHaveBeenCalled();
  writeDeletion({ userId: '本人', phase: 'done' });
  startAfterDeletion();
  expect(readDeletion()).toBeNull();
  expect(replace).toHaveBeenCalledWith('/');
});
