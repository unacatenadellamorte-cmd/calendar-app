import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Calendar } from './calendars';
import type { EventItem } from './events';

/**
 * IndexedDB の開設を1か所に集約する(AD-1: 表示専用の複製 + 書き込みキュー)。
 * - `calendars` / `events`: サーバーのアクティブ行のスナップショット(表示キャッシュ)
 * - `outbox`: オフライン中のミューテーション(順序保持。`seq` 昇順で再生)
 * - `meta`: 補助情報(最終同期時刻など)
 */

export type CacheStore = 'calendars' | 'events';

export interface OutboxItem {
  /** autoIncrement の主キー。再生順。 */
  seq: number;
  entity: 'calendar' | 'event';
  op: string;
  /** 対象の id(作成時はクライアント発番の id)。 */
  targetId: string;
  /** op ごとの引数(create の入力 / update の patch など)。 */
  payload?: unknown;
  enqueuedAt: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

interface CalendarAppDB extends DBSchema {
  calendars: { key: string; value: Calendar };
  events: { key: string; value: EventItem };
  outbox: { key: number; value: OutboxItem };
  meta: { key: string; value: MetaRow };
}

export type LocalDb = IDBPDatabase<CalendarAppDB>;

const DB_NAME = 'calendar-app';
const DB_VERSION = 1;

let dbPromise: Promise<LocalDb> | null = null;

export function getLocalDb(): Promise<LocalDb> {
  if (!dbPromise) {
    dbPromise = openDB<CalendarAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('calendars', { keyPath: 'id' });
        db.createObjectStore('events', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

/** テスト用: シングルトンの参照を捨てる(DB 自体は消さない)。 */
export function resetLocalDbForTests(): void {
  dbPromise = null;
}
