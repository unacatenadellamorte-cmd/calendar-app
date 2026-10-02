import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  isUuid,
  normalizeStore,
  planRevenueCatEvent,
} from './revenuecat-webhook';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const T = 1_800_000_000_000;
const DAY = 86_400_000;

function ev(over: Record<string, unknown>) {
  return {
    api_version: '1.0',
    event: {
      id: 'x',
      type: 'RENEWAL',
      app_user_id: U1,
      entitlement_ids: ['calendar_write'],
      product_id: 'calendar_write_monthly',
      store: 'PLAY_STORE',
      expiration_at_ms: T + 30 * DAY,
      event_timestamp_ms: T,
      ...over,
    },
  };
}

describe('planRevenueCatEvent: 付与系', () => {
  for (const type of [
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'SUBSCRIPTION_EXTENDED',
    'REFUND_REVERSED',
  ]) {
    it(`${type} は期限を保存する`, () => {
      const plan = planRevenueCatEvent(ev({ type }));
      expect(plan.changes).toEqual([
        {
          userId: U1,
          entitlement: 'calendar_write',
          expiresAt: new Date(T + 30 * DAY).toISOString(),
          active: true,
          productId: 'calendar_write_monthly',
          store: 'google_play',
          eventAtMs: T,
        },
      ]);
    });
  }

  it('multi_account だけの契約でも calendar_write を補完しない', () => {
    const plan = planRevenueCatEvent(ev({ entitlement_ids: ['multi_account'] }));
    expect(plan.changes.map((c) => c.entitlement)).toEqual(['multi_account']);
  });

  it('複数権利・未知の権利・重複', () => {
    const plan = planRevenueCatEvent(
      ev({ entitlement_ids: ['multi_account', 'pro', 'calendar_write', 'multi_account'] }),
    );
    expect(plan.changes.map((c) => c.entitlement)).toEqual(['multi_account', 'calendar_write']);
  });

  it('expiration_at_ms が無い付与は無視(無期限と誤解釈しない)', () => {
    expect(planRevenueCatEvent(ev({ expiration_at_ms: null })).changes).toEqual([]);
    expect(planRevenueCatEvent(ev({ expiration_at_ms: undefined })).changes).toEqual([]);
  });

  it('entitlement_ids が null / 無い場合は無視', () => {
    expect(planRevenueCatEvent(ev({ entitlement_ids: null })).changes).toEqual([]);
    expect(planRevenueCatEvent(ev({ entitlement_ids: undefined })).changes).toEqual([]);
  });

  it('app_user_id は小文字化される', () => {
    const plan = planRevenueCatEvent(ev({ app_user_id: U1.toUpperCase() }));
    expect(plan.changes[0]?.userId).toBe(U1);
  });

  it('store 名の正規化', () => {
    expect(planRevenueCatEvent(ev({ store: 'APP_STORE' })).changes[0]?.store).toBe('app_store');
    expect(normalizeStore(undefined)).toBeNull();
    expect(normalizeStore('STRIPE')).toBe('stripe');
  });
});

describe('planRevenueCatEvent: EXPIRATION', () => {
  it('過去の期限で保存(行は消さない)', () => {
    const plan = planRevenueCatEvent(ev({ type: 'EXPIRATION', expiration_at_ms: T - 1000 }));
    expect(plan.changes[0]).toMatchObject({
      expiresAt: new Date(T - 1000).toISOString(),
      active: false,
    });
  });
  it('期限が未来・欠損なら event 時刻で失効させる', () => {
    const a = planRevenueCatEvent(ev({ type: 'EXPIRATION', expiration_at_ms: T + DAY }));
    expect(a.changes[0]?.expiresAt).toBe(new Date(T).toISOString());
    expect(a.changes[0]?.active).toBe(false);
    const b = planRevenueCatEvent(ev({ type: 'EXPIRATION', expiration_at_ms: null }));
    expect(b.changes[0]?.expiresAt).toBe(new Date(T).toISOString());
  });
  it('entitlement_ids が無ければ無視', () => {
    expect(planRevenueCatEvent(ev({ type: 'EXPIRATION', entitlement_ids: null })).changes).toEqual([]);
  });
});

describe('planRevenueCatEvent: BILLING_ISSUE', () => {
  it('猶予期間が未来ならその時刻まで維持', () => {
    const plan = planRevenueCatEvent(
      ev({
        type: 'BILLING_ISSUE',
        expiration_at_ms: T - DAY,
        grace_period_expiration_at_ms: T + 3 * DAY,
      }),
    );
    expect(plan.changes[0]).toMatchObject({
      expiresAt: new Date(T + 3 * DAY).toISOString(),
      active: true,
    });
  });
  it('猶予が無い/過去なら変更しない', () => {
    expect(planRevenueCatEvent(ev({ type: 'BILLING_ISSUE' })).changes).toEqual([]);
    expect(
      planRevenueCatEvent(ev({ type: 'BILLING_ISSUE', grace_period_expiration_at_ms: T - 1 })).changes,
    ).toEqual([]);
  });
});

describe('planRevenueCatEvent: 変更しないイベント', () => {
  for (const type of [
    'CANCELLATION',
    'PRODUCT_CHANGE',
    'SUBSCRIPTION_PAUSED',
    'TEST',
    'NON_RENEWING_PURCHASE',
    'WHATEVER_NEW',
  ]) {
    it(`${type} は何もしない`, () => {
      const plan = planRevenueCatEvent(ev({ type }));
      expect(plan.changes).toEqual([]);
      expect(plan.transfers).toEqual([]);
    });
  }
});

describe('planRevenueCatEvent: 無視すべき入力', () => {
  it('匿名ID・非UUID', () => {
    expect(planRevenueCatEvent(ev({ app_user_id: '$RCAnonymousID:abc' })).changes).toEqual([]);
    expect(planRevenueCatEvent(ev({ app_user_id: 'not-a-uuid' })).changes).toEqual([]);
    expect(planRevenueCatEvent(ev({ app_user_id: 123 })).changes).toEqual([]);
  });
  it('壊れた本文でも例外を投げない', () => {
    for (const b of [null, undefined, 'x', 1, [], {}, { event: null }, { event: {} }, { event: { type: 5 } }]) {
      expect(planRevenueCatEvent(b).changes).toEqual([]);
    }
  });
  it('event_timestamp_ms が無ければ無視(順序判定できない)', () => {
    expect(planRevenueCatEvent(ev({ event_timestamp_ms: undefined })).changes).toEqual([]);
  });
});

describe('planRevenueCatEvent: TRANSFER', () => {
  it('UUID の from/to だけ付け替え対象にする', () => {
    const plan = planRevenueCatEvent({
      event: {
        type: 'TRANSFER',
        transferred_from: ['$RCAnonymousID:zzz', U1],
        transferred_to: [U2],
        event_timestamp_ms: T,
      },
    });
    expect(plan.transfers).toEqual([{ fromUserId: U1, toUserId: U2, eventAtMs: T }]);
    expect(plan.changes).toEqual([]);
  });
  it('移転元が匿名のみなら無視', () => {
    const plan = planRevenueCatEvent({
      event: {
        type: 'TRANSFER',
        transferred_from: ['$RCAnonymousID:a'],
        transferred_to: [U2],
        event_timestamp_ms: T,
      },
    });
    expect(plan.transfers).toEqual([]);
  });
  it('同一ユーザー同士は対象外', () => {
    const plan = planRevenueCatEvent({
      event: { type: 'TRANSFER', transferred_from: [U1], transferred_to: [U1], event_timestamp_ms: T },
    });
    expect(plan.transfers).toEqual([]);
  });
});

describe('補助', () => {
  it('isUuid', () => {
    expect(isUuid(U1)).toBe(true);
    expect(isUuid('$RCAnonymousID:1')).toBe(false);
  });
  it('constantTimeEqual', async () => {
    expect(await constantTimeEqual('abc', 'abc')).toBe(true);
    expect(await constantTimeEqual('abc', 'abd')).toBe(false);
    expect(await constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(await constantTimeEqual('', '')).toBe(true);
  });
});
