import { beforeEach, describe, expect, it, vi } from 'vitest';

let result: { data: unknown; error: unknown } = { data: null, error: null };
const calls: { method: string; args: unknown[] }[] = [];
function chain() {
  const value: Record<string, unknown> = {};
  for (const method of ['select', 'insert', 'update', 'eq', 'is', 'order', 'single']) {
    value[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return value;
    };
  }
  value.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return value;
}
const from = vi.fn(() => chain());
let supabaseValue: unknown = { from };
vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

const input = (over: Record<string, unknown> = {}) => ({
  name: '仕事',
  color: '#2563EB',
  startLocal: '22:00',
  endLocal: '06:00',
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'tag-1',
  name: '仕事',
  color: '#2563EB',
  all_day: false,
  start_local: '22:00',
  end_local: '06:00',
  created_at: '2026-09-25T00:00:00Z',
  updated_at: '2026-09-25T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  result = { data: null, error: null };
  supabaseValue = { from };
  from.mockClear();
});

describe('event-tags data', () => {
  it('日またぎ時刻を受け付け、camelCase に変換する', async () => {
    result = { data: row(), error: null };
    const { createEventTag, listEventTags } = await import('./event-tags');
    const created = await createEventTag(input());
    expect(created.ok && created.value).toMatchObject({ id: 'tag-1', startLocal: '22:00' });
    result = { data: [row()], error: null };
    const listed = await listEventTags();
    expect(listed.ok && listed.value[0]).toMatchObject({
      startLocal: '22:00',
      endLocal: '06:00',
    });
  });

  it.each([
    ['空名', { name: '' }, 'event-tag/invalid-name'],
    ['長すぎる名前', { name: 'あ'.repeat(201) }, 'event-tag/invalid-name'],
    ['不正色', { color: '#12345' }, 'event-tag/invalid-color'],
    ['同時刻', { startLocal: '09:00', endLocal: '09:00' }, 'event-tag/invalid-time'],
  ])('%s を拒否する', async (_label, over, key) => {
    const { createEventTag } = await import('./event-tags');
    const value = await createEventTag(input(over));
    expect(value.ok).toBe(false);
    if (!value.ok) expect(value.error.messageKey).toBe(key);
  });

  it('固定スタンプがあれば名称なしを保存し、不正IDは拒否する', async () => {
    const { createEventTag } = await import('./event-tags');
    result = { data: row({ name: '', stamp_id: 'work' }), error: null };
    const created = await createEventTag(input({ name: '', stampId: 'work' }));
    expect(created.ok && created.value).toMatchObject({ name: '', stampId: 'work' });
    expect(calls.find((call) => call.method === 'insert')?.args[0]).toMatchObject({
      name: '',
      stamp_id: 'work',
    });
    const invalid = await createEventTag(input({ stampId: 'arbitrary-svg' }));
    expect(invalid.ok).toBe(false);
  });

  it('削除は deleted_at を更新する', async () => {
    const { deleteEventTag } = await import('./event-tags');
    expect((await deleteEventTag('tag-1')).ok).toBe(true);
    expect(calls.find((call) => call.method === 'update')?.args[0]).toHaveProperty(
      'deleted_at',
    );
  });

  it('更新は変更フィールドだけ送り、戻り値を変換する', async () => {
    result = { data: row({ name: '休み' }), error: null };
    const { updateEventTag } = await import('./event-tags');
    const current = {
      allDay: false,
      id: 'tag-1',
      name: '仕事',
      color: '#2563EB',
      startLocal: '22:00',
      endLocal: '06:00',
      createdAt: '',
      updatedAt: '',
    };
    const updated = await updateEventTag(current, { name: '休み' });
    expect(updated.ok && updated.value.name).toBe('休み');
    expect(calls.find((call) => call.method === 'update')?.args[0]).toEqual({ name: '休み' });
  });
});

it('終日タグを正規化して作成・再取得し、編集のフラグを保存する', async () => {
  const { createEventTag, listEventTags, updateEventTag } = await import('./event-tags');
  result = {
    data: row({ all_day: true, start_local: '09:00', end_local: '18:00' }),
    error: null,
  };
  const created = await createEventTag(input({ allDay: true, startLocal: '', endLocal: '' }));
  expect(created.ok && created.value.allDay).toBe(true);
  expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
    all_day: true,
    start_local: '09:00',
    end_local: '18:00',
  });
  result = { data: [row(), row({ all_day: true })], error: null };
  const listed = await listEventTags();
  expect(listed.ok && listed.value.map((t) => t.allDay)).toEqual([false, true]);
  if (!listed.ok) throw new Error('一覧取得失敗');
  result = { data: row({ all_day: true }), error: null };
  const updated = await updateEventTag(listed.value[0]!, {
    allDay: true,
    startLocal: '09:00',
    endLocal: '09:00',
  });
  expect(updated.ok && updated.value.allDay).toBe(true);
  expect(calls.filter((c) => c.method === 'update').at(-1)?.args[0]).toMatchObject({
    all_day: true,
    start_local: '09:00',
    end_local: '18:00',
  });
  expect(
    calls
      .filter((c) => c.method === 'select')
      .every((c) => String(c.args[0]).split(',').includes('all_day')),
  ).toBe(true);
});
