import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';
import type { EventItem } from '@/data/events';

const listEvents = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const restoreEvent = vi.fn();
const setEventReminder = vi.fn();

vi.mock('@/data/events', () => ({
  listEvents: (r: unknown) => listEvents(r),
  createEvent: (i: unknown) => createEvent(i),
  updateEvent: (c: unknown, p: unknown) => updateEvent(c, p),
  deleteEvent: (c: unknown) => deleteEvent(c),
  restoreEvent: (id: string) => restoreEvent(id),
  setEventReminder: (id: string, m: number | null) => setEventReminder(id, m),
}));

const cancelReminder = vi.fn();
vi.mock('@/platform/reminders', () => ({
  cancelReminder: (id: number) => cancelReminder(id),
}));

const syncReminderForEvent = vi.fn();
vi.mock('@/data/reminders', () => ({
  syncReminderForEvent: (e: unknown) => syncReminderForEvent(e),
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
  reminderMinutes: null,
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
  [
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    restoreEvent,
    setEventReminder,
    cancelReminder,
    syncReminderForEvent,
  ].forEach((f) => f.mockReset());
  listEvents.mockResolvedValue(ok([ev()]));
  deleteEvent.mockResolvedValue(ok(undefined));
  cancelReminder.mockResolvedValue(undefined);
  syncReminderForEvent.mockResolvedValue(undefined);
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

  it('update の楽観更新は失敗でロールバックする(syncReminderForEvent は呼ばない)', async () => {
    updateEvent.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.update(ev(), { ...timedInput, title: '新タイトル' });
    });
    expect(result.current.events[0]?.title).toBe('MTG'); // 元に戻る
    expect(result.current.errorKey).toBe('data/query');
    expect(syncReminderForEvent).not.toHaveBeenCalled();
  });

  it('update 成功時は syncReminderForEvent を呼ぶ(時刻編集での cancel→再スケジュール、Story 5.4)', async () => {
    const updated = ev({ startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' });
    updateEvent.mockResolvedValue(ok(updated));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.update(ev(), timedInput);
    });
    expect(syncReminderForEvent).toHaveBeenCalledWith(updated);
  });

  it('remove で消え、Undo で戻る。削除成功時は同じ導出IDで cancelReminder を呼ぶ(Story 5.4)', async () => {
    deleteEvent.mockResolvedValue(ok(undefined));
    restoreEvent.mockResolvedValue(ok(undefined));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove(ev());
    });
    expect(result.current.events).toHaveLength(0);
    expect(result.current.pendingDelete?.id).toBe('e1');
    expect(cancelReminder).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.undoDelete();
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.pendingDelete).toBeNull();
  });

  it('Undo で復元した予定はリマインダーを再スケジュールする(Story 5.4)', async () => {
    const reminderEvent = ev({ id: 'r1', reminderMinutes: 30 });
    deleteEvent.mockResolvedValue(ok(undefined));
    restoreEvent.mockResolvedValue(ok(undefined));
    listEvents.mockResolvedValue(ok([reminderEvent]));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove(reminderEvent);
    });
    syncReminderForEvent.mockClear(); // remove では呼ばない(cancelReminder のみ)ので、ここでリセット

    await act(async () => {
      await result.current.undoDelete();
    });
    expect(syncReminderForEvent).toHaveBeenCalledWith(reminderEvent);
  });

  it('create 成功で直前の errorKey をクリアする', async () => {
    updateEvent.mockResolvedValue(err(appError('data/query', 'data/query')));
    createEvent.mockResolvedValue(ok(ev({ id: 'e9' })));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.update(ev(), { ...timedInput, title: 'x' });
    });
    expect(result.current.errorKey).toBe('data/query');
    await act(async () => {
      await result.current.create(timedInput);
    });
    expect(result.current.errorKey).toBeNull();
  });

  it('Undo 前に連続削除しても、前の孤児タイマが次の Undo バーを消さない', async () => {
    vi.useFakeTimers();
    try {
      deleteEvent.mockResolvedValue(ok(undefined));
      listEvents.mockResolvedValue(ok([ev({ id: 'a' }), ev({ id: 'b' })]));
      const { result } = renderHook(() => useEvents(true));
      await vi.waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.remove(ev({ id: 'a' })); // a のタイマは t=6000 で発火する予定
      });
      await act(async () => {
        vi.advanceTimersByTime(3000); // t=3000
      });
      await act(async () => {
        await result.current.remove(ev({ id: 'b' })); // b のタイマは t=9000
      });
      expect(result.current.pendingDelete?.id).toBe('b');

      // t=6000: a の孤児タイマが生きていれば発火して pendingDelete(b)を消してしまう。
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      // clearTimeout 済みなので b の Undo バーは残っている。
      expect(result.current.pendingDelete?.id).toBe('b');

      // t=9000: b 自身のタイマで確定 → 消える。
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.pendingDelete).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('remove が external 拒否を返したらリストを戻す(cancelReminder は呼ばない)', async () => {
    deleteEvent.mockResolvedValue(err(appError('event/not-editable', 'event/not-editable')));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.remove(ev({ source: 'google' }));
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.errorKey).toBe('event/not-editable');
    expect(cancelReminder).not.toHaveBeenCalled();
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

  describe('setReminder', () => {
    it('成功したら setEventReminder → syncReminderForEvent の順に呼び、一覧を更新する', async () => {
      setEventReminder.mockResolvedValue(ok(ev({ reminderMinutes: 30 })));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let success = false;
      await act(async () => {
        success = await result.current.setReminder(ev(), 30);
      });
      expect(success).toBe(true);
      expect(setEventReminder).toHaveBeenCalledWith('e1', 30);
      expect(syncReminderForEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', reminderMinutes: 30 }),
      );
      expect(result.current.events[0]?.reminderMinutes).toBe(30);
      expect(result.current.errorKey).toBeNull();
    });

    it('失敗したら errorKey を設定し、syncReminderForEvent を呼ばない', async () => {
      setEventReminder.mockResolvedValue(err(appError('data/query', 'data/query')));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let success = true;
      await act(async () => {
        success = await result.current.setReminder(ev(), 30);
      });
      expect(success).toBe(false);
      expect(result.current.errorKey).toBe('data/query');
      expect(syncReminderForEvent).not.toHaveBeenCalled();
    });

    it('null を渡すと解除として setEventReminder(id, null) を呼ぶ', async () => {
      setEventReminder.mockResolvedValue(ok(ev({ reminderMinutes: null })));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.setReminder(ev({ reminderMinutes: 30 }), null);
      });
      expect(setEventReminder).toHaveBeenCalledWith('e1', null);
    });
  });
});
