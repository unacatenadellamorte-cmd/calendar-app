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
