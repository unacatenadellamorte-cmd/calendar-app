import { getLocalDb, type OutboxItem } from './local-db';

/**
 * オフライン中のミューテーション・キュー(AD-9)。
 * 再生は `seq` 昇順(順序保持)。フラッシュ本体は `sync.ts`。
 */

export type OutboxInput = Omit<OutboxItem, 'seq' | 'enqueuedAt'>;

export async function enqueue(input: OutboxInput): Promise<void> {
  const db = await getLocalDb();
  await db.add('outbox', {
    ...input,
    enqueuedAt: new Date().toISOString(),
  } as OutboxItem);
}

/** `seq` 昇順の全項目。 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getLocalDb();
  const all = await db.getAll('outbox');
  return all.sort((a, b) => a.seq - b.seq);
}

export async function removeOutbox(seq: number): Promise<void> {
  const db = await getLocalDb();
  await db.delete('outbox', seq);
}

export async function outboxCount(): Promise<number> {
  const db = await getLocalDb();
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
): Promise<void> {
  const db = await getLocalDb();
  const tx = db.transaction('outbox', 'readwrite');
  for (const item of await tx.store.getAll()) {
    if (item.entity === entity && item.targetId === targetId && (!op || item.op === op)) {
      await tx.store.delete(item.seq);
    }
  }
  await tx.done;
}
