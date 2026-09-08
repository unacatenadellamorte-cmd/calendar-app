import { describe, expect, it } from 'vitest';
import type { Calendar } from './calendars';
import type { EventItem } from './events';
import { getLocalDb } from './local-db';
import { cacheDelete, cacheGetAll, cachePut, cacheRekey, cacheReplace } from './cache';

const cal = (id: string): Calendar => ({
  id,
  name: `cal-${id}`,
  color: '#2563EB',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
});

const ev = (id: string): EventItem => ({
  id,
  calendarId: 'c1',
  title: `ev-${id}`,
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  createdAt: '',
  updatedAt: '',
});

describe('local-db', () => {
  it('4つのストアで開設される', async () => {
    const db = await getLocalDb();
    expect([...db.objectStoreNames].sort()).toEqual(['calendars', 'events', 'meta', 'outbox']);
  });
});

describe('cache', () => {
  it('cacheReplace はストアをスナップショットで置き換える', async () => {
    await cacheReplace('calendars', [cal('a'), cal('b')]);
    await cacheReplace('calendars', [cal('b'), cal('c')]);
    const all = await cacheGetAll('calendars');
    expect(all.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });

  it('cachePut / cacheDelete で1行ずつ更新できる', async () => {
    await cachePut('events', ev('e1'));
    await cachePut('events', ev('e2'));
    expect((await cacheGetAll('events')).map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    await cacheDelete('events', 'e1');
    expect((await cacheGetAll('events')).map((e) => e.id)).toEqual(['e2']);
  });

  it('cacheRekey は旧キーを消して新しい行を入れる', async () => {
    await cachePut('events', ev('temp'));
    await cacheRekey('events', 'temp', ev('real'));
    expect((await cacheGetAll('events')).map((e) => e.id)).toEqual(['real']);
  });
});
