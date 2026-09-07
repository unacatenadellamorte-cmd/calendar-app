import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';
import type { EventItem } from '@/data/events';

const listEvents = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const restoreEvent = vi.fn();

vi.mock('@/data/events', () => ({
  listEvents: (r: unknown) => listEvents(r),
  createEvent: (i: unknown) => createEvent(i),
  updateEvent: (c: unknown, p: unknown) => updateEvent(c, p),
  deleteEvent: (c: unknown) => deleteEvent(c),
  restoreEvent: (id: string) => restoreEvent(id),
}));

const { useEvents } = await import('./useEvents');

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: 'MTG',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  createdAt: '2026-09-07T00:00:00Z',
  updatedAt: '2026-09-07T00:00:00Z',
  ...over,
});

const timedInput = {
  calendarId: 'c1',
  title: 'MTG',
  allDay: false as const,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
};

beforeEach(() => {
  [listEvents, createEvent, updateEvent, deleteEvent, restoreEvent].forEach((f) =>
    f.mockReset(),
  );
  listEvents.mockResolvedValue(ok([ev()]));
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('useEvents', () => {
  it('初期化でリストを読み込む', async () => {
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(1);
  });

  it('create 成功でリストに追加(時系列ソート)', async () => {
    createEvent.mockResolvedValue(ok(ev({ id: 'e2', startsAt: '2026-09-07T00:00:00Z' })));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create(timedInput);
    });
    expect(result.current.events.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('オフラインでは create せず event/offline を出す', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create(timedInput);
    });
    expect(createEvent).not.toHaveBeenCalled();
    expect(result.current.errorKey).toBe('event/offline');
  });

  it('update の楽観更新は失敗でロールバックする', async () => {
    updateEvent.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.update(ev(), { ...timedInput, title: '新タイトル' });
    });
    expect(result.current.events[0]?.title).toBe('MTG'); // 元に戻る
    expect(result.current.errorKey).toBe('data/query');
  });

  it('remove で消え、Undo で戻る', async () => {
    deleteEvent.mockResolvedValue(ok(undefined));
    restoreEvent.mockResolvedValue(ok(undefined));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove(ev());
    });
    expect(result.current.events).toHaveLength(0);
    expect(result.current.pendingDelete?.id).toBe('e1');

    await act(async () => {
      await result.current.undoDelete();
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.pendingDelete).toBeNull();
  });

  it('remove が external 拒否を返したらリストを戻す', async () => {
    deleteEvent.mockResolvedValue(err(appError('event/not-editable', 'event/not-editable')));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.remove(ev({ source: 'google' }));
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.errorKey).toBe('event/not-editable');
  });
});
