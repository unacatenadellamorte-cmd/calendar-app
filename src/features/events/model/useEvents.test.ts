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

const refreshFeaturedWidget = vi.fn();
vi.mock('@/platform/widget', () => ({
  refreshFeaturedWidget: (...a: unknown[]) => refreshFeaturedWidget(...a),
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
  isSecret: false,
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
    refreshFeaturedWidget,
  ].forEach((f) => f.mockReset());
  listEvents.mockResolvedValue(ok([ev()]));
  deleteEvent.mockResolvedValue(ok(undefined));
  cancelReminder.mockResolvedValue(undefined);
  syncReminderForEvent.mockResolvedValue(undefined);
  refreshFeaturedWidget.mockResolvedValue(undefined);
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

  it('update は isSecret を patch に含める(省略時は false、spec-secret-mode)', async () => {
    updateEvent.mockResolvedValue(ok(ev()));
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.update(ev(), timedInput);
    });
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1' }),
      expect.objectContaining({ isSecret: false }),
    );

    updateEvent.mockClear();
    await act(async () => {
      await result.current.update(ev(), { ...timedInput, isSecret: true });
    });
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1' }),
      expect.objectContaining({ isSecret: true }),
    );
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

  it('削除中に始まった古い再取得結果で、削除済み予定を再表示しない', async () => {
    let resolveReload!: (value: unknown) => void;
    const initial = ev();
    let listCalls = 0;
    listEvents.mockImplementation(() => {
      listCalls += 1;
      if (listCalls === 1) return Promise.resolve(ok([initial]));
      if (listCalls === 2) {
        return new Promise((resolve) => {
          resolveReload = resolve;
        });
      }
      return Promise.resolve(ok([initial]));
    });
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let reloadPromise!: Promise<void>;
    act(() => {
      reloadPromise = result.current.reload();
    });
    await act(async () => {
      await result.current.remove(initial);
    });

    // 削除開始前の一覧が遅れて返ってきても、楽観削除を巻き戻さない。
    resolveReload(ok([initial]));
    await act(async () => {
      await reloadPromise;
    });
    expect(result.current.events).toEqual([]);

    // 削除完了後に開始した再取得でも、遅延したサーバー応答を一時的に隠す。
    listEvents.mockResolvedValueOnce(ok([initial]));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.events).toEqual([]);
  });

  it('削除の応答待ち中に完了した再取得で、楽観削除を巻き戻さない', async () => {
    let resolveDelete!: (value: unknown) => void;
    let resolveReload!: (value: unknown) => void;
    const initial = ev();
    listEvents.mockResolvedValueOnce(ok([initial]));
    deleteEvent.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    listEvents.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReload = resolve;
      }),
    );
    let removePromise!: Promise<void>;
    let reloadPromise!: Promise<void>;
    act(() => {
      removePromise = result.current.remove(initial);
      reloadPromise = result.current.reload();
    });
    resolveReload(ok([initial]));
    await act(async () => {
      // 再取得は削除応答より先に完了する。
      await reloadPromise;
    });
    expect(result.current.events).toEqual([]);

    resolveDelete(ok(undefined));
    await act(async () => {
      await removePromise;
    });
    expect(result.current.events).toEqual([]);
  });

  it('削除失敗時は並行して追加された予定を巻き戻さず、対象予定だけ復元する', async () => {
    let resolveDelete!: (value: unknown) => void;
    const first = ev({ id: 'first' });
    const second = ev({ id: 'second' });
    const added = ev({ id: 'added' });
    listEvents.mockResolvedValueOnce(ok([first, second]));
    deleteEvent.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let removePromise!: Promise<void>;
    act(() => {
      removePromise = result.current.remove(first);
      result.current.addLocal([added]);
    });
    resolveDelete(err(appError('data/query', 'data/query')));
    await act(async () => {
      await removePromise;
    });
    expect(result.current.events).toHaveLength(3);
    expect(result.current.events.map((event) => event.id)).toEqual(
      expect.arrayContaining(['first', 'second', 'added']),
    );
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

  describe('refreshFeaturedWidget 呼び出し(Story 5.6)', () => {
    it('create 成功で呼ぶ', async () => {
      createEvent.mockResolvedValue(ok(ev({ id: 'e2' })));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.create(timedInput);
      });
      expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    });

    it('addLocal は同期関数のまま呼ぶ(fire-and-forget)', async () => {
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => {
        result.current.addLocal([ev({ id: 's1' })]);
      });
      expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    });

    it('addLocal に空配列を渡しても呼ばない', async () => {
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => {
        result.current.addLocal([]);
      });
      expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    });

    it('update 成功で呼ぶ', async () => {
      updateEvent.mockResolvedValue(ok(ev()));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.update(ev(), timedInput);
      });
      expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    });

    it('update 失敗では呼ばない', async () => {
      updateEvent.mockResolvedValue(err(appError('data/query', 'data/query')));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.update(ev(), timedInput);
      });
      expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    });

    it('remove 成功で呼ぶ', async () => {
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.remove(ev());
      });
      expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    });

    it('remove が external 拒否で失敗したときは呼ばない', async () => {
      deleteEvent.mockResolvedValue(err(appError('event/not-editable', 'event/not-editable')));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.remove(ev({ source: 'google' }));
      });
      expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    });

    it('undoDelete 成功で呼ぶ', async () => {
      restoreEvent.mockResolvedValue(ok(undefined));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.remove(ev());
      });
      refreshFeaturedWidget.mockClear(); // remove 分をリセットして undoDelete 分だけ見る
      await act(async () => {
        await result.current.undoDelete();
      });
      expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
    });

    it('setReminder では呼ばない(表示フィールドを変えないため)', async () => {
      setEventReminder.mockResolvedValue(ok(ev({ reminderMinutes: 30 })));
      const { result } = renderHook(() => useEvents(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.setReminder(ev(), 30);
      });
      expect(refreshFeaturedWidget).not.toHaveBeenCalled();
    });
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
