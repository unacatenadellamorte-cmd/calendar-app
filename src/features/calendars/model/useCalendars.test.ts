import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';
import type { Calendar } from '@/data/calendars';

const listCalendars = vi.fn();
const ensureShiftCalendar = vi.fn();
const createCalendar = vi.fn();
const renameCalendar = vi.fn();
const recolorCalendar = vi.fn();
const setCalendarVisible = vi.fn();
const reorderCalendars = vi.fn();
const deleteCalendar = vi.fn();
const restoreCalendar = vi.fn();

vi.mock('@/data/calendars', () => ({
  listCalendars: () => listCalendars(),
  ensureShiftCalendar: () => ensureShiftCalendar(),
  createCalendar: (i: unknown) => createCalendar(i),
  renameCalendar: (id: string, n: string) => renameCalendar(id, n),
  recolorCalendar: (id: string, c: string) => recolorCalendar(id, c),
  setCalendarVisible: (id: string, v: boolean) => setCalendarVisible(id, v),
  reorderCalendars: (ids: string[]) => reorderCalendars(ids),
  deleteCalendar: (c: unknown) => deleteCalendar(c),
  restoreCalendar: (c: unknown) => restoreCalendar(c),
  sortCalendars: (list: Calendar[]) =>
    [...list].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)),
}));

const { useCalendars } = await import('./useCalendars');

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#0072B2',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '2026-09-07T00:00:00Z',
  updatedAt: '2026-09-07T00:00:00Z',
  ...over,
});
const shift = cal({ id: 's1', name: 'シフト', isShift: true });

beforeEach(() => {
  [
    listCalendars,
    ensureShiftCalendar,
    createCalendar,
    renameCalendar,
    recolorCalendar,
    setCalendarVisible,
    reorderCalendars,
    deleteCalendar,
    restoreCalendar,
  ].forEach((f) => f.mockReset());
  ensureShiftCalendar.mockResolvedValue(ok(shift));
  listCalendars.mockResolvedValue(ok([shift, cal()]));
});

describe('useCalendars', () => {
  it('enabled=false のとき読み込まない', () => {
    const { result } = renderHook(() => useCalendars(false));
    expect(ensureShiftCalendar).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('初期化で ensureShiftCalendar → listCalendars の順に呼ぶ', async () => {
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ensureShiftCalendar).toHaveBeenCalled();
    expect(listCalendars).toHaveBeenCalled();
    expect(result.current.calendars.map((c) => c.id)).toEqual(['s1', 'c1']);
  });

  it('create 成功で一覧に追加する', async () => {
    createCalendar.mockResolvedValue(ok(cal({ id: 'c2', name: '個人' })));
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create({ name: '個人', color: '#009E73' });
    });
    expect(result.current.calendars.map((c) => c.id)).toContain('c2');
  });

  it('create 失敗で errorKey を反映する', async () => {
    createCalendar.mockResolvedValue(
      err(appError('calendar/invalid-color', 'calendar/invalid-color')),
    );
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create({ name: 'x', color: '#000000' });
    });
    expect(result.current.errorKey).toBe('calendar/invalid-color');
  });

  it('remove で一覧から消え、Undo で戻す', async () => {
    deleteCalendar.mockResolvedValue(ok(undefined));
    restoreCalendar.mockResolvedValue(ok(undefined));
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove(cal());
    });
    expect(result.current.calendars.map((c) => c.id)).toEqual(['s1']);
    expect(result.current.pendingDelete?.id).toBe('c1');

    await act(async () => {
      await result.current.undoDelete();
    });
    expect(result.current.calendars.map((c) => c.id)).toContain('c1');
    expect(result.current.pendingDelete).toBeNull();
  });

  it('remove がシフト拒否エラーを返したら一覧は変えず errorKey を出す', async () => {
    deleteCalendar.mockResolvedValue(
      err(appError('calendar/shift-undeletable', 'calendar/shift-undeletable')),
    );
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.remove(shift);
    });
    expect(result.current.calendars.map((c) => c.id)).toEqual(['s1', 'c1']);
    expect(result.current.errorKey).toBe('calendar/shift-undeletable');
  });

  it('ensureShiftCalendar 失敗で errorKey を出し loading を止める', async () => {
    ensureShiftCalendar.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKey).toBe('data/query');
    expect(listCalendars).not.toHaveBeenCalled();
  });

  it('reorder は楽観的に並べ替え、成功で確定順を反映する', async () => {
    listCalendars.mockResolvedValue(ok([cal({ id: 'a', priority: 0 }), cal({ id: 'b', priority: 1 })]));
    reorderCalendars.mockResolvedValue(
      ok([cal({ id: 'b', priority: 0 }), cal({ id: 'a', priority: 1 })]),
    );
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.reorder(['b', 'a']);
    });
    expect(reorderCalendars).toHaveBeenCalledWith(['b', 'a']);
    expect(result.current.calendars.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('reorder が失敗したら元の順に戻し errorKey を出す', async () => {
    listCalendars.mockResolvedValue(ok([cal({ id: 'a', priority: 0 }), cal({ id: 'b', priority: 1 })]));
    reorderCalendars.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useCalendars(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.reorder(['b', 'a']);
    });
    expect(result.current.calendars.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.current.errorKey).toBe('data/query');
  });
});
