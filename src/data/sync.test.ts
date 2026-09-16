import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appError, err, ok } from './result';
import { enqueue, listOutbox } from './outbox';
import { cacheGetAll } from './cache';
import type { EventItem } from './events';

const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const createCalendar = vi.fn();
const renameCalendar = vi.fn();
const recolorCalendar = vi.fn();
const setCalendarVisible = vi.fn();
const reorderCalendars = vi.fn();
const deleteCalendar = vi.fn();

vi.mock('./events', () => ({
  createEvent: (...a: unknown[]) => createEvent(...a),
  updateEvent: (...a: unknown[]) => updateEvent(...a),
  deleteEvent: (...a: unknown[]) => deleteEvent(...a),
}));
vi.mock('./calendars', () => ({
  createCalendar: (...a: unknown[]) => createCalendar(...a),
  renameCalendar: (...a: unknown[]) => renameCalendar(...a),
  recolorCalendar: (...a: unknown[]) => recolorCalendar(...a),
  setCalendarVisible: (...a: unknown[]) => setCalendarVisible(...a),
  reorderCalendars: (...a: unknown[]) => reorderCalendars(...a),
  deleteCalendar: (...a: unknown[]) => deleteCalendar(...a),
}));

const refreshFeaturedWidget = vi.fn();
vi.mock('@/platform/widget', () => ({
  refreshFeaturedWidget: (...a: unknown[]) => refreshFeaturedWidget(...a),
}));

const { flushOutbox } = await import('./sync');

const ev = (id: string): EventItem => ({
  id,
  calendarId: 'c1',
  title: id,
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
  reminderMinutes: null,
  isSecret: false,
  createdAt: '',
  updatedAt: '',
});

beforeEach(() => {
  [
    createEvent,
    updateEvent,
    deleteEvent,
    createCalendar,
    renameCalendar,
    recolorCalendar,
    setCalendarVisible,
    reorderCalendars,
    deleteCalendar,
  ].forEach((f) => f.mockReset());
  refreshFeaturedWidget.mockReset();
  refreshFeaturedWidget.mockResolvedValue(undefined);
});

describe('flushOutbox', () => {
  it('seq 昇順で再生し、成功したら outbox を空にする', async () => {
    await enqueue({ entity: 'event', op: 'create', targetId: 't1', payload: { id: 't1' } });
    await enqueue({ entity: 'event', op: 'update', targetId: 't1', payload: { title: 'x' } });
    createEvent.mockResolvedValue(ok(ev('t1')));
    updateEvent.mockResolvedValue(ok(ev('t1')));

    const result = await flushOutbox();
    expect(result).toEqual({ flushed: 2, dropped: 0, interrupted: false });
    expect(await listOutbox()).toHaveLength(0);
    // update は create で確定した id で呼ばれる
    expect(updateEvent.mock.calls[0]![0]).toEqual({ id: 't1', source: 'local' });
  });

  it('作成でサーバーが別 id を返したら、後続の update に実 id を適用する', async () => {
    await enqueue({ entity: 'event', op: 'create', targetId: 'temp', payload: { id: 'temp' } });
    await enqueue({ entity: 'event', op: 'update', targetId: 'temp', payload: { title: 'y' } });
    createEvent.mockResolvedValue(ok(ev('real')));
    updateEvent.mockResolvedValue(ok(ev('real')));

    await flushOutbox();
    expect(updateEvent.mock.calls[0]![0]).toEqual({ id: 'real', source: 'local' });
    expect((await cacheGetAll('events')).map((e) => e.id)).toEqual(['real']);
  });

  it('恒久エラーの項目は破棄して継続する', async () => {
    await enqueue({ entity: 'event', op: 'update', targetId: 'gone', payload: { title: 'z' } });
    await enqueue({ entity: 'event', op: 'delete', targetId: 'e2' });
    updateEvent.mockResolvedValue(err(appError('data/query', 'data/query', { code: '404' })));
    deleteEvent.mockResolvedValue(ok(undefined));

    const result = await flushOutbox();
    expect(result).toMatchObject({ flushed: 1, dropped: 1, interrupted: false });
    expect(await listOutbox()).toHaveLength(0);
  });

  it('calendar/reorder は reorderCalendars を orderedIds で呼ぶ', async () => {
    await enqueue({
      entity: 'calendar',
      op: 'reorder',
      targetId: 'reorder',
      payload: { orderedIds: ['c2', 'c1'] },
    });
    reorderCalendars.mockResolvedValue(ok([]));
    const result = await flushOutbox();
    expect(reorderCalendars).toHaveBeenCalledWith(['c2', 'c1']);
    expect(result.flushed).toBe(1);
  });

  it('ネットワーク障害で中断し、未処理項目は残す', async () => {
    await enqueue({ entity: 'event', op: 'update', targetId: 'e1', payload: { title: 'a' } });
    await enqueue({ entity: 'event', op: 'delete', targetId: 'e2' });
    updateEvent.mockResolvedValue(
      err(appError('data/query', 'data/query', new TypeError('Failed to fetch'))),
    );

    const result = await flushOutbox();
    expect(result.interrupted).toBe(true);
    expect(await listOutbox()).toHaveLength(2);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  describe('refreshFeaturedWidget 呼び出し(Story 5.6)', () => {
    it('1件以上反映できたら呼ぶ', async () => {
      await enqueue({ entity: 'event', op: 'create', targetId: 't1', payload: { id: 't1' } });
      createEvent.mockResolvedValue(ok(ev('t1')));

      await flushOutbox();
      expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    });

    it('0件(全部破棄 or 何も無し)のときは呼ばない', async () => {
      await enqueue({ entity: 'event', op: 'update', targetId: 'gone', payload: { title: 'z' } });
      updateEvent.mockResolvedValue(err(appError('data/query', 'data/query', { code: '404' })));

      const result = await flushOutbox();
      expect(result).toMatchObject({ flushed: 0, dropped: 1 });
      expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    });

    it('ネットワーク障害で中断したときは呼ばない', async () => {
      await enqueue({ entity: 'event', op: 'update', targetId: 'e1', payload: { title: 'a' } });
      updateEvent.mockResolvedValue(
        err(appError('data/query', 'data/query', new TypeError('Failed to fetch'))),
      );

      await flushOutbox();
      expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    });
  });
});
