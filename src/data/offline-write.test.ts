import { describe, expect, it } from 'vitest';
import { cacheGetAll, cachePut } from './cache';
import { listOutbox } from './outbox';
import type { EventItem } from './events';
import {
  newLocalId,
  offlineCreateEvent,
  offlineDeleteEvent,
  offlineRestoreEvent,
  offlineUpdateEvent,
} from './offline-write';

const timedInput = {
  calendarId: 'c1',
  title: '  会議  ',
  allDay: false as const,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
};

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '会議',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('offline-write', () => {
  it('newLocalId は v4 UUID を返す', () => {
    expect(newLocalId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('offlineCreateEvent はキャッシュに楽観行、outbox に create、ok を返す', async () => {
    const r = await offlineCreateEvent('local-1', timedInput);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ id: 'local-1', title: '会議', source: 'local' });
    expect((await cacheGetAll('events')).map((e) => e.id)).toEqual(['local-1']);
    const outbox = await listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: 'event', op: 'create', targetId: 'local-1' });
  });

  it('offlineUpdateEvent はキャッシュ行にマージし outbox に update', async () => {
    await cachePut('events', ev({ id: 'e1' }));
    const r = await offlineUpdateEvent('e1', { title: '新タイトル' });
    expect(r.ok && r.value.title).toBe('新タイトル');
    expect((await cacheGetAll('events'))[0]!.title).toBe('新タイトル');
    expect((await listOutbox())[0]).toMatchObject({ op: 'update', targetId: 'e1' });
  });

  it('offlineDeleteEvent はキャッシュから消し outbox に delete', async () => {
    await cachePut('events', ev({ id: 'e1' }));
    await offlineDeleteEvent('e1');
    expect(await cacheGetAll('events')).toHaveLength(0);
    expect((await listOutbox())[0]).toMatchObject({ op: 'delete', targetId: 'e1' });
  });

  it('offlineRestoreEvent はキュー済み delete を消してキャッシュを戻す', async () => {
    await cachePut('events', ev({ id: 'e1' }));
    await offlineDeleteEvent('e1');
    await offlineRestoreEvent(ev({ id: 'e1' }));
    expect((await cacheGetAll('events')).map((e) => e.id)).toEqual(['e1']);
    expect(await listOutbox()).toHaveLength(0);
  });
});
