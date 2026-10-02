import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * entitlements.ts の検証。supabase の from チェーンをモックする。
 */

let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
const selectCalls: unknown[][] = [];
const isCalls: unknown[][] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    selectCalls.push(args);
    return chain;
  };
  chain.is = (...args: unknown[]) => {
    isCalls.push(args);
    return chain;
  };
  chain.returns = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
  return chain;
}
const from = vi.fn(() => makeChain());
let supabaseValue: unknown = { from };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

const { listMyEntitlements, isEntitlementActive } = await import('./entitlements');

beforeEach(() => {
  queryResult = { data: null, error: null };
  selectCalls.length = 0;
  isCalls.length = 0;
  from.mockClear();
  supabaseValue = { from };
});

describe('listMyEntitlements', () => {
  it('entitlements から camelCase で返す(deleted_at では絞らない)', async () => {
    queryResult = {
      data: [
        { entitlement: 'multi_account', expires_at: '2026-11-01T00:00:00Z' },
        { entitlement: 'calendar_write', expires_at: null },
      ],
      error: null,
    };
    const r = await listMyEntitlements();
    expect(from).toHaveBeenCalledWith('entitlements');
    expect(selectCalls[0]).toEqual(['entitlement,expires_at']);
    expect(isCalls).toEqual([]);
    expect(r).toEqual({
      ok: true,
      value: [
        { entitlement: 'multi_account', expiresAt: '2026-11-01T00:00:00Z' },
        { entitlement: 'calendar_write', expiresAt: null },
      ],
    });
  });

  it('行が無ければ空配列', async () => {
    const r = await listMyEntitlements();
    expect(r).toEqual({ ok: true, value: [] });
  });

  it('クエリエラーは data/query', async () => {
    queryResult = { data: null, error: { message: 'nope' } };
    const r = await listMyEntitlements();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });

  it('ネットワーク障害は data/offline', async () => {
    queryResult = { data: null, error: { message: 'Failed to fetch' } };
    const r = await listMyEntitlements();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
  });

  it('Supabase 未設定なら data/unavailable', async () => {
    supabaseValue = null;
    const r = await listMyEntitlements();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/unavailable');
  });
});

describe('isEntitlementActive', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  it('expires_at が null は無期限で有効', () => {
    expect(isEntitlementActive({ entitlement: 'multi_account', expiresAt: null }, now)).toBe(true);
  });
  it('未来は有効', () => {
    expect(
      isEntitlementActive({ entitlement: 'multi_account', expiresAt: '2026-10-02T12:00:01Z' }, now),
    ).toBe(true);
  });
  it('過去・ちょうど今は無効', () => {
    expect(
      isEntitlementActive({ entitlement: 'multi_account', expiresAt: '2026-10-01T00:00:00Z' }, now),
    ).toBe(false);
    expect(
      isEntitlementActive({ entitlement: 'multi_account', expiresAt: '2026-10-02T12:00:00Z' }, now),
    ).toBe(false);
  });
  it('解釈できない日時は無効(権利なし側に倒す)', () => {
    expect(isEntitlementActive({ entitlement: 'calendar_write', expiresAt: 'not-a-date' }, now)).toBe(
      false,
    );
  });
});
