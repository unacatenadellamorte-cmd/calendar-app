import { getLocalDb, type CacheStore } from './local-db';
import type { Calendar } from './calendars';
import type { EventItem } from './events';

/**
 * 表示キャッシュの読み書き(AD-1: 表示専用の複製)。
 * `calendars` / `events` はサーバーのアクティブ行(`deleted_at IS NULL`)のみを保持する。
 */

type CacheRow = { calendars: Calendar; events: EventItem };

/** そのストアを rows だけに置き換える(サーバー取得成功時のスナップショット反映)。 */
export async function cacheReplace<S extends CacheStore>(
  store: S,
  rows: CacheRow[S][],
): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction(store, 'readwrite');
  await tx.store.clear();
  for (const row of rows) await tx.store.put(row);
  await tx.done;
}

export async function cacheGetAll<S extends CacheStore>(store: S): Promise<CacheRow[S][]> {
  const db = await getLocalDb();
  return (await db.getAll(store)) as CacheRow[S][];
}

/** 1行を upsert(楽観更新・フラッシュ後の実データ反映)。 */
export async function cachePut<S extends CacheStore>(
  store: S,
  row: CacheRow[S],
): Promise<void> {
  const db = await getLocalDb();
  await db.put(store, row);
}

/** 1行を削除(論理削除の楽観反映)。 */
export async function cacheDelete(store: CacheStore, id: string): Promise<void> {
  const db = await getLocalDb();
  await db.delete(store, id);
}

/** キーを張り替えて upsert(仮 id → 実 id)。 */
export async function cacheRekey<S extends CacheStore>(
  store: S,
  oldId: string,
  row: CacheRow[S],
): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction(store, 'readwrite');
  if (oldId !== (row as { id: string }).id) await tx.store.delete(oldId);
  await tx.store.put(row);
  await tx.done;
}
