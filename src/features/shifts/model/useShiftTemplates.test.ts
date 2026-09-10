import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { appError, err, ok } from '@/data/result';
import type { ShiftTemplate } from '@/data/shift-templates';

const listShiftTemplates = vi.fn();
const createShiftTemplate = vi.fn();
const updateShiftTemplate = vi.fn();
const deleteShiftTemplate = vi.fn();
const restoreShiftTemplate = vi.fn();

vi.mock('@/data/shift-templates', () => ({
  listShiftTemplates: () => listShiftTemplates(),
  createShiftTemplate: (i: unknown) => createShiftTemplate(i),
  updateShiftTemplate: (c: unknown, p: unknown) => updateShiftTemplate(c, p),
  deleteShiftTemplate: (id: string) => deleteShiftTemplate(id),
  restoreShiftTemplate: (id: string) => restoreShiftTemplate(id),
}));

const { useShiftTemplates } = await import('./useShiftTemplates');

const tpl = (over: Partial<ShiftTemplate> = {}): ShiftTemplate => ({
  id: 't1',
  name: '平日',
  startLocal: '17:00',
  endLocal: '22:00',
  breakMinutes: 30,
  hourlyWage: 1100,
  workplaceLabel: null,
  color: '#009E73',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.useRealTimers();
  for (const m of [listShiftTemplates, createShiftTemplate, updateShiftTemplate, deleteShiftTemplate, restoreShiftTemplate]) {
    m.mockReset();
  }
  listShiftTemplates.mockResolvedValue(ok([]));
});

describe('useShiftTemplates', () => {
  it('マウントで一覧を createdAt 順に読む', async () => {
    listShiftTemplates.mockResolvedValue(
      ok([tpl({ id: 'b', createdAt: '2026-09-02T00:00:00Z' }), tpl({ id: 'a', createdAt: '2026-09-01T00:00:00Z' })]),
    );
    const { result } = renderHook(() => useShiftTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.templates.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('enabled=false なら読まない', async () => {
    renderHook(() => useShiftTemplates(false));
    expect(listShiftTemplates).not.toHaveBeenCalled();
  });

  it('create 成功で一覧に足す', async () => {
    createShiftTemplate.mockResolvedValue(ok(tpl({ id: 'new' })));
    const { result } = renderHook(() => useShiftTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let outcome = false;
    await act(async () => {
      outcome = await result.current.create({} as never);
    });
    expect(outcome).toBe(true);
    expect(result.current.templates.map((t) => t.id)).toEqual(['new']);
  });

  it('create 失敗で errorKey を立て、一覧は変えない', async () => {
    createShiftTemplate.mockResolvedValue(err(appError('shift-template/invalid-wage', 'shift-template/invalid-wage')));
    const { result } = renderHook(() => useShiftTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create({} as never);
    });
    expect(result.current.errorKey).toBe('shift-template/invalid-wage');
    expect(result.current.templates).toEqual([]);
  });

  it('create 失敗 → 再度 create 成功で errorKey をクリアする', async () => {
    const { result } = renderHook(() => useShiftTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    createShiftTemplate.mockResolvedValueOnce(
      err(appError('shift-template/invalid-wage', 'shift-template/invalid-wage')),
    );
    await act(async () => {
      await result.current.create({} as never);
    });
    expect(result.current.errorKey).toBe('shift-template/invalid-wage');

    createShiftTemplate.mockResolvedValueOnce(ok(tpl({ id: 'ok' })));
    await act(async () => {
      await result.current.create({} as never);
    });
    expect(result.current.errorKey).toBeNull();
  });

  it('update 失敗で楽観分をロールバックする', async () => {
    listShiftTemplates.mockResolvedValue(ok([tpl({ id: 't1', name: '平日' })]));
    updateShiftTemplate.mockResolvedValue(err(appError('shift-template/invalid-time', 'shift-template/invalid-time')));
    const { result } = renderHook(() => useShiftTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.update(result.current.templates[0]!, { name: '早番' });
    });
    expect(result.current.templates[0]!.name).toBe('平日');
    expect(result.current.errorKey).toBe('shift-template/invalid-time');
  });

  it('remove → pendingDelete、undoDelete で戻す', async () => {
    listShiftTemplates.mockResolvedValue(ok([tpl({ id: 't1' })]));
    deleteShiftTemplate.mockResolvedValue(ok(undefined));
    restoreShiftTemplate.mockResolvedValue(ok(undefined));
    const { result } = renderHook(() => useShiftTemplates(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove(result.current.templates[0]!);
    });
    expect(result.current.templates).toEqual([]);
    expect(result.current.pendingDelete?.id).toBe('t1');

    await act(async () => {
      await result.current.undoDelete();
    });
    expect(result.current.templates.map((t) => t.id)).toEqual(['t1']);
    expect(result.current.pendingDelete).toBeNull();
  });
});
