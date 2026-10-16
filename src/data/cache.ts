import { isAccountDataBlocked } from './account-deletion-state';
import { getLocalDb, type CacheStore } from './local-db';
import type { Calendar } from './calendars';
import type { EventItem } from './events';

/**
 * 表示キャッシュの読み書き(AD-1: 表示専用の複製)。
 * `calendars` / `events` はサーバーのアクティブ行(`deleted_at IS NULL`)のみを保持する。
 */

type CacheRow = { calendars: Calendar; events: EventItem };

/** 取得開始後の保存・削除を、遅れて届く一覧で消さずに反映する。 */
export async function cacheMergeSnapshot<S extends CacheStore>(
  store: S,
  rows: CacheRow[S][],
  baseline: CacheRow[S][],
): Promise<CacheRow[S][]> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const tx = db.transaction([store, 'outbox'], 'readwrite');
  const cacheStore = tx.objectStore(store);
  const current = (await cacheStore.getAll()) as CacheRow[S][];
  const pending = await tx.objectStore('outbox').getAll();
  const before = new Map(baseline.map((row) => [row.id, row]));
  const currentIds = new Set(current.map((row) => row.id));
  const merged = new Map(rows.map((row) => [row.id, row]));
  for (const row of current) {
    if (JSON.stringify(before.get(row.id)) !== JSON.stringify(row)) merged.set(row.id, row);
  }
  for (const row of baseline) {
    if (!currentIds.has(row.id)) merged.delete(row.id);
  }
  const currentById = new Map(current.map((row) => [row.id, row]));
  for (const item of pending) {
    if (item.entity !== (store === 'events' ? 'event' : 'calendar')) continue;
    const row = currentById.get(item.targetId);
    if (row) merged.set(row.id, row);
    else merged.delete(item.targetId);
  }
  await cacheStore.clear();
  for (const row of merged.values()) await cacheStore.put(row);
  await tx.done;
  return [...merged.values()];
}

/** そのストアを rows だけに置き換える(サーバー取得成功時のスナップショット反映)。 */
export async function cacheReplace<S extends CacheStore>(
  store: S,
  rows: CacheRow[S][],
): Promise<void> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const tx = db.transaction(store, 'readwrite');
  await tx.store.clear();
  for (const row of rows) await tx.store.put(row);
  await tx.done;
}

export async function cacheGetAll<S extends CacheStore>(store: S): Promise<CacheRow[S][]> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  return (await db.getAll(store)) as CacheRow[S][];
}

/** 1行を upsert(楽観更新・フラッシュ後の実データ反映)。 */
export async function cachePut<S extends CacheStore>(
  store: S,
  row: CacheRow[S],
): Promise<void> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  await db.put(store, row);
}

/** 1行を削除(論理削除の楽観反映)。 */
export async function cacheDelete(store: CacheStore, id: string): Promise<void> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  await db.delete(store, id);
}

/** キーを張り替えて upsert(仮 id → 実 id)。 */
export async function cacheRekey<S extends CacheStore>(
  store: S,
  oldId: string,
  row: CacheRow[S],
): Promise<void> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const tx = db.transaction(store, 'readwrite');
  if (oldId !== (row as { id: string }).id) await tx.store.delete(oldId);
  await tx.store.put(row);
  await tx.done;
}
