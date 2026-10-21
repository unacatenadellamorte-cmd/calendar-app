import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheGetAll, cachePut } from './cache';
import { claimOutbox, enqueue, listOutbox } from './outbox';
import { offlineRestoreCalendar, offlineRestoreEvent } from './offline-write';
import type { Calendar } from './calendars';
const state = vi.hoisted(() => ({ offline: false, rows: [] as Record<string, unknown>[], offsets: [] as number[], failAt: -1 }));
vi.mock('./net', async (original) => ({ ...await original<typeof import('./net')>(), isOffline: () => state.offline }));
vi.mock('@/platform/widget', () => ({ refreshFeaturedWidget: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: () => {
  let offset = 0; let patch: Record<string, unknown> | null = null; let id: unknown;
  const query: Record<string, unknown> = {};
  for (const name of ['select', 'is', 'order', 'limit']) query[name] = () => query;
  query.eq = (_: string, value: unknown) => { id = value; return query; };
  query.range = (start: number) => { offset = start; return query; };
  query.update = (value: Record<string, unknown>) => { patch = value; return query; };
  query.then = (resolve: (value: unknown) => unknown) => {
    if (patch) { Object.assign(state.rows.find(row => row.id === id)!, patch); return resolve({ error: null }); }
    state.offsets.push(offset);
    if (offset === state.failAt) return resolve({ data: null, error: { message: '取得失敗' } });
    const active = state.rows.filter(row => !row.deleted_at);
    return resolve({ data: active.slice(offset, offset + 2), count: active.length, error: null });
  };
  return query;
} } }));
import { deleteEvent, listEvents, restoreEvent, toEvent, type EventRow } from './events';
import { flushOutbox } from './sync';
const row = (id: string) => ({ id, calendar_id: 'c', title: id, all_day: false, starts_at: '2026-10-22T01:00:00Z', ends_at: '2026-10-22T02:00:00Z', event_date: null, source: 'local', deleted_at: null } as unknown as EventRow);
beforeEach(() => { state.offline = false; state.offsets = []; state.failAt = -1; state.rows = Array.from({ length: 7 }, (_, i) => row(`e${i}`) as unknown as Record<string, unknown>); });
describe('包括監査の取得・復元回帰', () => {
  it('サーバー上限が要求ページより小さくても全件取得してからキャッシュを更新する', async () => {
    const result = await listEvents();
    expect(result.ok && result.value.length).toBe(7);
    expect(state.offsets).toEqual([0, 2, 4, 6]);
    expect(await cacheGetAll('events')).toHaveLength(7);
  });
  it('途中ページが失敗したら既存キャッシュを部分集合で消さない', async () => {
    await cachePut('events', toEvent(row('保護する予定')));
    state.failAt = 2;
    expect((await listEvents()).ok).toBe(false);
    expect((await cacheGetAll('events')).map(row => row.id)).toEqual(['保護する予定']);
  });
  it('送信済み削除のオフライン取り消しを復帰時にサーバーへ反映する', async () => {
    const event = toEvent(row('e0'));
    await cachePut('events', event);
    expect((await deleteEvent(event)).ok).toBe(true);
    state.offline = true;
    expect((await restoreEvent(event)).ok).toBe(true);
    expect((await listOutbox()).map(item => item.op)).toEqual(['restore']);
    state.offline = false;
    expect((await flushOutbox()).flushed).toBe(1);
    expect((await listEvents()).ok).toBe(true);
    expect((await cacheGetAll('events')).some(row => row.id === 'e0')).toBe(true);
  });

  it('未送信deleteはUndoで取り除き、送信中deleteは残してrestoreを後置する', async () => {
    const event = toEvent(row('e1'));
    await cachePut('events', event);
    await enqueue({ entity: 'event', op: 'delete', targetId: event.id });
    expect((await offlineRestoreEvent(event)).ok).toBe(true);
    expect(await listOutbox()).toEqual([]);

    await enqueue({ entity: 'event', op: 'delete', targetId: event.id });
    const claimed = claimOutbox(await listOutbox());
    try {
      expect((await offlineRestoreEvent(event)).ok).toBe(true);
      expect((await listOutbox()).map((item) => item.op)).toEqual(['delete', 'restore']);
    } finally {
      claimed();
    }
  });

  it('カレンダーのUndoも未送信deleteだけを取り消す', async () => {
    const calendar: Calendar = {
      id: 'cal-undo',
      name: '通常',
      color: '#0072B2',
      source: 'local',
      isShift: false,
      isVisible: true,
      priority: 0,
      createdAt: '',
      updatedAt: '',
    };
    await cachePut('calendars', calendar);
    await enqueue({ entity: 'calendar', op: 'delete', targetId: calendar.id });
    expect((await offlineRestoreCalendar(calendar)).ok).toBe(true);
    expect(await listOutbox()).toEqual([]);
    expect((await cacheGetAll('calendars')).map((row) => row.id)).toEqual([calendar.id]);
  });
});
