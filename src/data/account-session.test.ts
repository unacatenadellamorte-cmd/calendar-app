import { expect, it, vi } from 'vitest';
import { clearPreviousAccountSession } from './account-session';
import { adoptAccountOwner } from './account-scope';
import { isAccountDataBlocked } from './account-deletion-state';
import { getLocalDb } from './local-db';
import { enqueue } from './outbox';
const effects = vi.hoisted(() => ({
  notifications: vi.fn(),
  widgets: vi.fn(),
  background: vi.fn(),
  apply: vi.fn(),
}));
vi.mock('@/platform/reminders', () => ({ clearAccountNotifications: effects.notifications }));
vi.mock('@/platform/widget', () => ({ clearAccountWidgets: effects.widgets }));
vi.mock('@/features/settings/model/backgroundImage', () => ({
  storeBackground: effects.background,
  applyBackground: effects.apply,
}));

it('送信を先に停止し、未送信キューを保管したまま通知・ウィジェット・背景を消す', async () => {
  adoptAccountOwner('A');
  const db = await getLocalDb();
  await db.put('events', { id: 'Aの予定' } as never);
  await db.put('calendars', { id: 'Aのカレンダー' } as never);
  await db.put('meta', { key: '秘密', value: 'A' });
  await enqueue({
    entity: 'event',
    op: 'update',
    targetId: 'Aの予定',
    payload: { title: '未送信の編集' },
  });
  effects.notifications.mockImplementation(async () => {
    expect(isAccountDataBlocked()).toBe(true);
  });
  await clearPreviousAccountSession();
  expect(await db.count('outbox')).toBe(1);
  for (const store of ['events', 'calendars', 'meta'] as const)
    expect(await db.count(store)).toBe(0);
  expect(effects.notifications).toHaveBeenCalledTimes(1);
  expect(effects.widgets).toHaveBeenCalledTimes(1);
  expect(effects.background).toHaveBeenCalledWith(null);
  expect(effects.apply).toHaveBeenCalledWith(null);
});

it('権利キャッシュの削除失敗でも通知等を解放し、利用者切替自体は失敗として止める', async () => {
  localStorage.setItem('calendar-app.entitlements.v1.A', '[]');
  const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('保存領域を利用できない');
  });
  const calls = effects.notifications.mock.calls.length;
  try {
    await expect(clearPreviousAccountSession()).rejects.toThrow('保存領域を利用できない');
    expect(effects.notifications).toHaveBeenCalledTimes(calls + 1);
    expect(effects.widgets).toHaveBeenCalled();
    expect(effects.background).toHaveBeenCalledWith(null);
  } finally {
    remove.mockRestore();
    localStorage.removeItem('calendar-app.entitlements.v1.A');
  }
});
