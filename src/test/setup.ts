import { applyLanguage } from '@/i18n';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetLocalDbForTests } from '@/data/local-db';

beforeEach(() => {
  applyLanguage('ja');
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
  document.documentElement.removeAttribute('data-theme');
});
