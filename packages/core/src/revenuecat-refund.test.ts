import { expect, it } from 'vitest';
import { changesFromSubscriber, planRevenueCatEvent } from './revenuecat-webhook';

const userId = '10000000-0000-4000-8000-000000000001';
const now = Date.parse('2026-10-15T00:00:00Z');
it('過去商品の返金でも現在状態を照合し、過去期限だけで権利を剥奪しない', () => {
  const plan = planRevenueCatEvent({
    event: {
      type: 'CANCELLATION',
      app_user_id: userId,
      cancel_reason: 'CUSTOMER_SUPPORT',
      event_timestamp_ms: now,
      entitlement_ids: ['calendar_write'],
      expiration_at_ms: now - 86400000,
      product_id: 'old-monthly',
    },
  });
  expect(plan.reconciliation).toEqual({ userId, eventAtMs: now });
  expect(plan.changes).toEqual([]);
});
it('期限内の通常解約を維持し、期限切れ取消だけを失効する', () => {
  const event = {
    type: 'CANCELLATION',
    app_user_id: userId,
    event_timestamp_ms: now,
    entitlement_ids: ['calendar_write'],
    expiration_at_ms: now + 86400000,
  };
  expect(planRevenueCatEvent({ event }).changes).toEqual([]);
  expect(
    planRevenueCatEvent({ event: { ...event, expiration_at_ms: now - 1 } }).changes[0]?.active,
  ).toBe(false);
  expect(
    planRevenueCatEvent({ event: { ...event, cancel_reason: 'CUSTOMER_SUPPORT' } })
      .reconciliation,
  ).toEqual({ userId, eventAtMs: now });
});
it('返金後の現在状態で権利を維持または失効し、不正応答からは推測しない', () => {
  const grace = changesFromSubscriber(
    {
      subscriber: {
        entitlements: {
          calendar_write: {
            expires_date: '2026-10-14T00:00:00Z',
            grace_period_expires_date: '2026-10-20T00:00:00Z',
            product_identifier: 'write-monthly',
          },
        },
      },
    },
    userId,
    now,
  )!;
  expect(grace[0]?.active).toBe(true);
  expect(grace[0]?.expiresAt).toBe('2026-10-20T00:00:00.000Z');
  const active = changesFromSubscriber(
    {
      subscriber: {
        entitlements: {
          calendar_write: {
            expires_date: '2026-11-15T00:00:00Z',
            product_identifier: 'write-monthly',
          },
        },
      },
    },
    userId,
    now,
  )!;
  expect(active[0]?.active).toBe(true);
  expect(active[1]?.active).toBe(false);
  expect(
    changesFromSubscriber({ subscriber: { entitlements: {} } }, userId, now)?.every(
      (change) => !change.active,
    ),
  ).toBe(true);
  for (const entry of [
    null,
    {},
    { expires_date: null },
    { expires_date: '不正', product_identifier: 'p' },
  ]) {
    expect(
      changesFromSubscriber(
        { subscriber: { entitlements: { calendar_write: entry } } },
        userId,
        now,
      ),
    ).toBeNull();
  }
  expect(changesFromSubscriber({}, userId, now)).toBeNull();
});
