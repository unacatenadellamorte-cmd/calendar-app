import { expect, it, vi } from 'vitest';
import {
  adoptAccountOwner,
  beginAccountTransition,
  requireAccountOwner,
  resetAccountScopeForTests,
} from './account-scope';
import { clearLocalCachedData, getLocalDb, legacyOutboxCount } from './local-db';
import { enqueue, listOutbox } from './outbox';
import { accountAwareFetch } from './supabase';

it('所有者不明の旧キューを移送・削除せず、AとBの未送信操作を分離する', async () => {
  await enqueue({ entity: 'event', op: 'delete', targetId: '旧版' });
  requireAccountOwner();
  await expect(getLocalDb()).rejects.toThrow('利用者の確認前');
  adoptAccountOwner('A');
  expect(await listOutbox()).toEqual([]);
  await enqueue({ entity: 'event', op: 'delete', targetId: 'Aの予定' });
  await clearLocalCachedData();
  expect((await listOutbox()).map((item) => item.targetId)).toEqual(['Aの予定']);
  resetAccountScopeForTests();
  adoptAccountOwner('B');
  expect(await listOutbox()).toEqual([]);
  await enqueue({ entity: 'event', op: 'delete', targetId: 'Bの予定' });
  resetAccountScopeForTests();
  adoptAccountOwner('A');
  expect((await listOutbox()).map((item) => item.targetId)).toEqual(['Aの予定']);
  expect(await legacyOutboxCount()).toBe(1);
});

it('切替前の遅延応答と切替後の新規送信を遮断する', async () => {
  let complete!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    ),
  );
  try {
    adoptAccountOwner('A');
    const pending = accountAwareFetch('https://example.invalid/rest/v1/events');
    beginAccountTransition();
    complete(new Response('[]'));
    await expect(pending).rejects.toThrow();
    await expect(
      accountAwareFetch('https://example.invalid/rest/v1/events'),
    ).rejects.toThrow();
    await expect(
      enqueue({ entity: 'event', op: 'delete', targetId: '送れない予定' }),
    ).rejects.toThrow();
    expect(await (await getLocalDb()).count('outbox')).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});
