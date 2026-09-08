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
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
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
  it('初期化でリストを読み込む(全期間・range 引数なし)', async () => {
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(1);
    // 月 / 週 / リストは過去も見るため範囲で絞らない(Story 1.5)。
    expect(listEvents).toHaveBeenCalledWith(undefined);
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

  it('オフラインでも createEvent を呼ぶ(data 層がキューに積む。エラー表示しない)', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    // data 層はオフラインでも楽観行を ok で返す。
    createEvent.mockResolvedValue(ok(ev({ id: 'local-1' })));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create(timedInput);
    });
    expect(createEvent).toHaveBeenCalledWith(timedInput);
    expect(result.current.errorKey).toBeNull();
    expect(result.current.events.map((e) => e.id)).toContain('local-1');
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

  it('addLocal は作成済み予定を時系列ソートで一覧へ足す', async () => {
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.addLocal([
        ev({ id: 's1', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' }),
        ev({ id: 's2', startsAt: '2026-09-08T03:00:00Z', endsAt: '2026-09-08T04:00:00Z' }),
      ]);
    });
    const ids = result.current.events.map((e) => e.id);
    expect(ids).toContain('s1');
    expect(ids).toContain('s2');
    expect(ids.indexOf('s2')).toBeLessThan(ids.indexOf('s1'));
  });
});
