import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok } from '@/data/result';

const listConnectionCalendars = vi.fn();
const refreshGoogleCalendars = vi.fn();
const setGoogleCalendarSelected = vi.fn();
vi.mock('@/data/google-calendars', () => ({
  listConnectionCalendars: (...args: unknown[]) => listConnectionCalendars(...args),
  refreshGoogleCalendars: (...args: unknown[]) => refreshGoogleCalendars(...args),
  setGoogleCalendarSelected: (...args: unknown[]) => setGoogleCalendarSelected(...args),
}));

const { useGoogleCalendars } = await import('./useGoogleCalendars');

const choice = (selected: boolean) => ({
  externalCalendarId: 'cal-1',
  summary: 'Work',
  backgroundColor: null,
  selected,
  lastSyncedAt: null,
  lastError: null,
});

beforeEach(() => {
  listConnectionCalendars.mockReset().mockResolvedValue(ok([choice(false)]));
  refreshGoogleCalendars.mockReset().mockResolvedValue(ok({ count: 1 }));
  setGoogleCalendarSelected.mockReset().mockResolvedValue(ok(undefined));
});

describe('useGoogleCalendars', () => {
  it('選択保存成功後の次回取得を外部の選択状態へ同期する', async () => {
    const { result } = renderHook(() => useGoogleCalendars('connection-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    listConnectionCalendars.mockResolvedValue(ok([choice(true)]));

    await act(async () => { await result.current.toggle('cal-1', true); });
    expect(result.current.choices[0]?.selected).toBe(true);

    listConnectionCalendars.mockResolvedValue(ok([choice(false)]));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.choices[0]?.selected).toBe(false);
  });

  it('接続切替後に前の接続の遅い更新を反映しない', async () => {
    let finishOld!: (value: ReturnType<typeof ok>) => void;
    listConnectionCalendars.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useGoogleCalendars(id), {
      initialProps: { id: 'old' as string | null },
    });
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { finishOld(ok([{ ...choice(true), externalCalendarId: 'old-cal' }])); });
    expect(result.current.choices.map((item) => item.externalCalendarId)).not.toContain('old-cal');
  });
});
