import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ok, err, appError } from '@/data/result';

const listSyncState = vi.fn();
const syncGoogleCalendarsNow = vi.fn();

vi.mock('@/data/google-sync', () => ({
  listSyncState: () => listSyncState(),
  syncGoogleCalendarsNow: () => syncGoogleCalendarsNow(),
}));

const { useCalendarSyncStatus } = await import('./useCalendarSyncStatus');

const state = (calendarId: string | null, lastError: string | null) => ({
  calendarId,
  externalCalendarId: 'x',
  lastSyncedAt: null,
  lastError,
});

beforeEach(() => {
  listSyncState.mockReset().mockResolvedValue(ok([]));
  syncGoogleCalendarsNow.mockReset().mockResolvedValue(ok({ synced: [], errors: [] }));
});

describe('useCalendarSyncStatus', () => {
  it('sync_state の last_error を calendar_id 別に持つ(calendar_id null は無視)', async () => {
    listSyncState.mockResolvedValue(ok([state('c1', 'sync-failed'), state(null, 'x'), state('c2', null)]));
    const { result } = renderHook(() => useCalendarSyncStatus(true));
    await waitFor(() => expect(result.current.errorByCalendarId.size).toBe(1));
    expect(result.current.errorByCalendarId.get('c1')).toBe('sync-failed');
  });

  it('enabled=false なら空', async () => {
    listSyncState.mockResolvedValue(ok([state('c1', 'sync-failed')]));
    const { result } = renderHook(() => useCalendarSyncStatus(false));
    expect(result.current.errorByCalendarId.size).toBe(0);
    expect(listSyncState).not.toHaveBeenCalled();
  });

  it('retry 成功: 再取得して警告が消える', async () => {
    listSyncState.mockResolvedValueOnce(ok([state('c1', 'sync-failed')]));
    const { result } = renderHook(() => useCalendarSyncStatus(true));
    await waitFor(() => expect(result.current.errorByCalendarId.size).toBe(1));

    listSyncState.mockResolvedValue(ok([state('c1', null)])); // 解消後
    await act(async () => {
      await result.current.retry();
    });
    expect(syncGoogleCalendarsNow).toHaveBeenCalledTimes(1);
    expect(result.current.errorByCalendarId.size).toBe(0);
    expect(result.current.retryErrorKey).toBeNull();
  });

  it('retry 失敗: retryErrorKey をセット', async () => {
    const { result } = renderHook(() => useCalendarSyncStatus(true));
    syncGoogleCalendarsNow.mockResolvedValue(err(appError('sync/failed', 'sync/failed')));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.retryErrorKey).toBe('sync/failed');
    expect(result.current.retrying).toBe(false);
  });
});
