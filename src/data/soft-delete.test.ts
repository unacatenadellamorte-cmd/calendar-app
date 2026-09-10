import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { method: string; args: unknown[] }[] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of ['select', 'is', 'eq', 'order']) chain[m] = record(m);
  return chain;
}

const from = vi.fn();
let supabaseValue: unknown = { from };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

const { selectActive } = await import('./soft-delete');

beforeEach(() => {
  calls.length = 0;
  from.mockReset().mockImplementation((table: string) => {
    calls.push({ method: 'from', args: [table] });
    return makeChain();
  });
  supabaseValue = { from };
});

describe('selectActive', () => {
  it('from(table).select(columns).is(deleted_at, null) を組む', () => {
    selectActive('events', 'id,title');
    expect(calls).toEqual([
      { method: 'from', args: ['events'] },
      { method: 'select', args: ['id,title'] },
      { method: 'is', args: ['deleted_at', null] },
    ]);
  });

  it('columns 省略時は *', () => {
    selectActive('calendars');
    expect(calls[1]).toEqual({ method: 'select', args: ['*'] });
  });

  it('count オプションは select の第2引数に渡る', () => {
    selectActive('events', '*', { count: 'exact', head: true });
    expect(calls[1]).toEqual({
      method: 'select',
      args: ['*', { count: 'exact', head: true }],
    });
  });

  it('返り値にそのままチェーンできる', () => {
    selectActive('events').eq('user_id', 'u1').order('starts_at');
    expect(calls.map((c) => c.method)).toEqual(['from', 'select', 'is', 'eq', 'order']);
  });
});
