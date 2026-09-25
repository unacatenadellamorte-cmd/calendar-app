import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMyAccount } from './auth';
import { readDeletion, writeDeletion } from './account-deletion-state';
import { getLocalDb } from './local-db';
import { cachePut, cacheReplace } from './cache';
import { enqueue } from './outbox';
import { readBackground, storeBackground } from '@/features/settings/model/backgroundImage';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), setHeader: vi.fn(), session: vi.fn(), signOut: vi.fn(), notifications: vi.fn(), widgets: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.session, signOut: mocks.signOut } } }));
vi.mock('@/platform/reminders', () => ({ clearAccountNotifications: mocks.notifications }));
vi.mock('@/platform/widget', () => ({ clearAccountWidgets: mocks.widgets }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { access_token: '本人のJWT', user: { id: '本人' } } }, error: null });
  mocks.rpc.mockReturnValue({ setHeader: mocks.setHeader });
  mocks.setHeader.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.notifications.mockResolvedValue(undefined);
  mocks.widgets.mockResolvedValue(undefined);
});

describe('アカウント削除', () => {
  it('本人IDをRPCへ渡さず全ストアを空にして完了を永続化する', async () => {
    await storeBackground(new Blob(['本人の画像'], { type: 'image/jpeg' }));
    const db = await getLocalDb();
    await db.put('events', { id: '旧予定' } as never);
    await db.put('calendars', { id: '旧カレンダー' } as never);
    await db.put('meta', { key: '旧状態', value: '秘密' });
    await enqueue({ entity: 'event', op: 'create', targetId: '未送信' });
    mocks.setHeader.mockImplementation(async () => {
      expect(readDeletion()).toEqual({ userId: '本人', phase: 'remote' });
      return { error: null };
    });
    expect((await deleteMyAccount()).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('delete_my_account');
    for (const name of db.objectStoreNames) expect(await db.count(name)).toBe(0);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.notifications).toHaveBeenCalledTimes(1);
    expect(mocks.widgets).toHaveBeenCalledTimes(1);
    expect(await readBackground()).toBeUndefined();
    expect(readDeletion()?.phase).toBe('done');
  });

  it('確認後に別タブでセッションが切り替わっても本人JWTを固定する', async () => {
    mocks.rpc.mockImplementation(() => {
      mocks.session.mockResolvedValue({ data: { session: { user: { id: '別人' }, access_token: '別人のJWT' } }, error: null });
      return { setHeader: mocks.setHeader };
    });
    expect((await deleteMyAccount()).ok).toBe(true);
    expect(mocks.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer 本人のJWT');
  });

  it('再開専用呼出しは記録がなければ新規削除を開始しない', async () => {
    expect((await deleteMyAccount(true)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('通信失敗なら成功と表示せずremoteを残し再試行する', async () => {
    mocks.setHeader.mockRejectedValueOnce(new TypeError('通信失敗'));
    expect((await deleteMyAccount()).ok).toBe(false);
    expect(readDeletion()?.phase).toBe('remote');
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect((await deleteMyAccount()).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('端末消去の失敗と再起動相当の再試行ではサーバー削除を繰り返さない', async () => {
    mocks.notifications.mockRejectedValueOnce(new Error('通知消去失敗'));
    expect((await deleteMyAccount()).ok).toBe(false);
    expect(readDeletion()?.phase).toBe('local');
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    expect((await deleteMyAccount()).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.notifications).toHaveBeenCalledTimes(2);
  });

  it('ウィジェット消去の失敗でもlocalを保持し、再試行で完了する', async () => {
    mocks.widgets.mockRejectedValueOnce(new Error('ウィジェット消去失敗'));
    expect((await deleteMyAccount()).ok).toBe(false);
    expect(readDeletion()?.phase).toBe('local');
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect((await deleteMyAccount()).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('未認証と別ユーザーのセッションでは削除しない', async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    expect((await deleteMyAccount()).ok).toBe(false);
    expect(readDeletion()).toBeNull();
    writeDeletion({ userId: '別人', phase: 'remote' });
    mocks.session.mockResolvedValue({ data: { session: { access_token: '本人のJWT', user: { id: '本人' } } }, error: null });
    expect((await deleteMyAccount()).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('削除後の遅延キャッシュ書込みと未送信操作を拒否する', async () => {
    await deleteMyAccount();
    await expect(cachePut('events', { id: '旧予定' } as never)).rejects.toThrow();
    await expect(cacheReplace('calendars', [{ id: '旧予定' } as never])).rejects.toThrow();
    await expect(enqueue({ entity: 'event', op: 'create', targetId: '旧予定' })).rejects.toThrow();
    expect(await (await getLocalDb()).count('events')).toBe(0);
  });
});
