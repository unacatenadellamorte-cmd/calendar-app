import { isAccountDataBlocked } from './account-deletion-state';
import { getLocalDb, type OutboxItem } from './local-db';

/**
 * オフライン中のミューテーション・キュー(AD-9)。
 * 再生は `seq` 昇順(順序保持)。フラッシュ本体は `sync.ts`。
 */

export type OutboxInput = Omit<OutboxItem, 'seq' | 'enqueuedAt'>;
const inFlight = new Set<number>();
const listeners = new Set<() => void>();
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function changed(): void { for (const listener of listeners) listener(); }
/** 読み出したキューを再送処理が所有している間は、取り消しで消さない。 */
export function claimOutbox(items: OutboxItem[]): () => void {
  for (const item of items) inFlight.add(item.seq);
  return () => { for (const item of items) inFlight.delete(item.seq); };
}

export async function enqueue(input: OutboxInput): Promise<void> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  await db.add('outbox', {
    ...input,
    enqueuedAt: new Date().toISOString(),
  } as OutboxItem);
  changed();
}

/** `seq` 昇順の全項目。 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const all = await db.getAll('outbox');
  return all.sort((a, b) => a.seq - b.seq);
}

export async function removeOutbox(seq: number): Promise<void> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  await db.delete('outbox', seq);
  changed();
}

export async function outboxCount(): Promise<number> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  return db.count('outbox');
}

/**
 * ある対象の未送信項目を取り除く。オフライン中の「削除 → 取り消し(Undo)」で、
 * まだ送っていない delete をキューから消してキャッシュを戻すのに使う。
 * `op` 指定時はその op のみ、省略時は対象の全項目。
 */
export async function dropOutboxFor(
  entity: OutboxItem['entity'],
  targetId: string,
  op?: string,
): Promise<number> {
  const db = await getLocalDb();
  if (isAccountDataBlocked()) throw new Error('アカウントの削除中です');
  const tx = db.transaction('outbox', 'readwrite');
  let removed = 0;
  for (const item of await tx.store.getAll()) {
    if (!inFlight.has(item.seq) && item.entity === entity && item.targetId === targetId && (!op || item.op === op)) {
      await tx.store.delete(item.seq);
      removed += 1;
    }
  }
  await tx.done;
  if (removed) changed();
  return removed;
}
