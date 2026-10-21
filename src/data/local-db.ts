import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Calendar } from './calendars';
import type { EventItem } from './events';
import { accountOwnerMissing, accountScopeGeneration, localAccountOwner } from './account-scope';
import { isAccountDataBlocked } from './account-deletion-state';

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

const databases = new Map<string, Promise<LocalDb>>();

export function getLocalDb(): Promise<LocalDb> {
  if (accountOwnerMissing()) return Promise.reject(new Error('利用者の確認前です'));
  const owner = localAccountOwner();
  return openLocalDb(owner ? `${DB_NAME}.user.${encodeURIComponent(owner)}` : DB_NAME);
}

function openLocalDb(name: string): Promise<LocalDb> {
  let dbPromise = databases.get(name);
  if (!dbPromise) {
    dbPromise = openDB<CalendarAppDB>(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('calendars', { keyPath: 'id' });
        db.createObjectStore('events', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    databases.set(name, dbPromise);
  }
  return dbPromise;
}

/** テスト用: シングルトンの参照を捨てる(DB 自体は消さない)。 */
export function resetLocalDbForTests(): void {
  databases.clear();
}

/** 利用者別DBの補助メタデータを読み取る。プロフィールや一覧キャッシュに使う。 */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const generation = accountScopeGeneration();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const db = await getLocalDb();
  if (generation !== accountScopeGeneration() || isAccountDataBlocked()) throw new Error('利用者が切り替わりました');
  const row = await db.get('meta', key);
  if (generation !== accountScopeGeneration() || isAccountDataBlocked()) throw new Error('利用者が切り替わりました');
  return row?.value as T | undefined;
}

/** 利用者別DBの補助メタデータを保存する。 */
export async function putMeta<T>(key: string, value: T): Promise<void> {
  const generation = accountScopeGeneration();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const db = await getLocalDb();
  if (generation !== accountScopeGeneration() || isAccountDataBlocked()) throw new Error('利用者が切り替わりました');
  await db.put('meta', { key, value });
  if (generation !== accountScopeGeneration() || isAccountDataBlocked()) throw new Error('利用者が切り替わりました');
}

/** 一覧キャッシュを失効させる。未取得状態と空一覧を混同しない。 */
export async function deleteMeta(key: string): Promise<void> {
  const generation = accountScopeGeneration();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const db = await getLocalDb();
  if (generation !== accountScopeGeneration() || isAccountDataBlocked()) throw new Error('利用者が切り替わりました');
  await db.delete('meta', key);
}

/** 旧版の所有者不明キューは移送も削除もせず隔離し、画面へ存在だけを知らせる。 */
export async function legacyOutboxCount(): Promise<number> {
  return (await openLocalDb(DB_NAME)).count('outbox');
}

/** ログアウトでは未送信操作を消さず、表示用の複製だけを消す。 */
export async function clearLocalCachedData(): Promise<void> {
  const db = await getLocalDb();
  const stores = ['calendars', 'events', 'meta'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  await Promise.all(stores.map((store) => tx.objectStore(store).clear()));
  await tx.done;
}

/** 表示キャッシュと未送信操作を一つのトランザクションで消す。 */
export async function clearLocalAccountData(): Promise<void> {
  const db = await getLocalDb();
  const stores = ['calendars', 'events', 'outbox', 'meta'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  await Promise.all(stores.map((store) => tx.objectStore(store).clear()));
  await tx.done;
}
