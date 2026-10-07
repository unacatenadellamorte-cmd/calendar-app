import { applyLanguage } from '@/i18n';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetLocalDbForTests } from '@/data/local-db';
import { resetDeletionStateForTests } from '@/data/account-deletion-state';

beforeEach(() => {
  resetDeletionStateForTests();
  if (typeof document !== 'undefined') applyLanguage('ja');
  // 各テストで IndexedDB をまっさらにする。
  globalThis.indexedDB = new IDBFactory();
  resetLocalDbForTests();
});

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-theme');
});
