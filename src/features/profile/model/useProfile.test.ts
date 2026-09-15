import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { appError, err, ok } from '@/data/result';
import type { Profile } from '@/data/profiles';

const getProfile = vi.fn();
const createProfile = vi.fn();
const updateProfile = vi.fn();

vi.mock('@/data/profiles', () => ({
  getProfile: () => getProfile(),
  createProfile: (i: unknown) => createProfile(i),
  updateProfile: (p: unknown) => updateProfile(p),
}));

const { useProfile } = await import('./useProfile');

const profile: Profile = { id: 'u1', displayName: '花子', avatarDataUrl: null };

beforeEach(() => {
  [getProfile, createProfile, updateProfile].forEach((f) => f.mockReset());
  getProfile.mockResolvedValue(ok(profile));
});

describe('useProfile', () => {
  it('enabled=false のとき読み込まない', () => {
    const { result } = renderHook(() => useProfile(false));
    expect(getProfile).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toBeNull();
  });

  it('enabled=true で getProfile を呼び、結果を反映する', async () => {
    const { result } = renderHook(() => useProfile(true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toEqual(profile);
  });

  it('行が無ければ profile は null のまま(エラーではない)', async () => {
    getProfile.mockResolvedValue(ok(null));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.errorKey).toBeNull();
  });

  it('getProfile が失敗したら errorKey・loadErrorKey の両方を反映する', async () => {
    getProfile.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKey).toBe('data/query');
    expect(result.current.loadErrorKey).toBe('data/query');
  });

  it('create: 成功したら profile を更新し true を返す', async () => {
    getProfile.mockResolvedValue(ok(null));
    createProfile.mockResolvedValue(ok(profile));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const success = await result.current.create({ displayName: '花子' });
      expect(success).toBe(true);
    });
    expect(result.current.profile).toEqual(profile);
  });

  it('create: 失敗したら errorKey をセットし false を返す(loadErrorKey は変えない)', async () => {
    getProfile.mockResolvedValue(ok(null));
    createProfile.mockResolvedValue(err(appError('profile/invalid-name', 'profile/invalid-name')));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const success = await result.current.create({ displayName: '' });
      expect(success).toBe(false);
    });
    expect(result.current.errorKey).toBe('profile/invalid-name');
    // create の失敗は「取得失敗」ではないので loadErrorKey は null のまま
    // (AppShell がオンボーディングを取得エラー扱いに倒さないため)。
    expect(result.current.loadErrorKey).toBeNull();
  });

  it('update: 成功したら profile を更新する', async () => {
    const updated = { ...profile, displayName: '次郎' };
    updateProfile.mockResolvedValue(ok(updated));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const success = await result.current.update({ displayName: '次郎' });
      expect(success).toBe(true);
    });
    expect(result.current.profile).toEqual(updated);
  });

  it('update: 失敗したら errorKey をセットする', async () => {
    updateProfile.mockResolvedValue(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const success = await result.current.update({ displayName: '' });
      expect(success).toBe(false);
    });
    expect(result.current.errorKey).toBe('data/query');
  });

  it('reload: 失敗後に成功すると loadErrorKey が消える', async () => {
    getProfile.mockResolvedValueOnce(err(appError('data/query', 'data/query')));
    const { result } = renderHook(() => useProfile(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadErrorKey).toBe('data/query');

    getProfile.mockResolvedValueOnce(ok(profile));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.loadErrorKey).toBeNull();
    expect(result.current.profile).toEqual(profile);
  });
});
