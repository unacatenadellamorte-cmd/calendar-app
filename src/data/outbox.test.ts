import { describe, expect, it } from 'vitest';
import {
  dropOutboxFor,
  enqueue,
  listOutbox,
  outboxCount,
  removeOutbox,
} from './outbox';

describe('outbox', () => {
  it('enqueue した順(seq 昇順)で listOutbox が返す', async () => {
    await enqueue({ entity: 'event', op: 'create', targetId: 'e1', payload: { t: 1 } });
    await enqueue({ entity: 'event', op: 'update', targetId: 'e1', payload: { t: 2 } });
    await enqueue({ entity: 'calendar', op: 'create', targetId: 'c1' });
    const items = await listOutbox();
    expect(items.map((i) => [i.entity, i.op])).toEqual([
      ['event', 'create'],
      ['event', 'update'],
      ['calendar', 'create'],
    ]);
    expect(items[0]!.seq).toBeLessThan(items[1]!.seq);
    expect(await outboxCount()).toBe(3);
  });

  it('removeOutbox で1件消せる', async () => {
    await enqueue({ entity: 'event', op: 'delete', targetId: 'e9' });
    const [item] = await listOutbox();
    await removeOutbox(item!.seq);
    expect(await outboxCount()).toBe(0);
  });

  it('dropOutboxFor は対象の項目だけ消す(Undo 用)', async () => {
    await enqueue({ entity: 'event', op: 'create', targetId: 'e1' });
    await enqueue({ entity: 'event', op: 'delete', targetId: 'e1' });
    await enqueue({ entity: 'event', op: 'delete', targetId: 'e2' });
    await dropOutboxFor('event', 'e1', 'delete');
    const items = await listOutbox();
    expect(items.map((i) => [i.op, i.targetId])).toEqual([
      ['create', 'e1'],
      ['delete', 'e2'],
    ]);
  });
});
