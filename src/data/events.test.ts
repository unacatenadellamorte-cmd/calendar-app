import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** supabase クエリビルダのモック(calendars.test.ts と同型)。 */
let queryResult: { data: unknown; error: unknown } = { data: null, error: null };
const calls: { method: string; args: unknown[] }[] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'is',
    'or',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    chain[m] = record(m);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(queryResult);
  return chain;
}

const from = vi.fn();
let supabaseValue: unknown = { from };

vi.mock('@/data/supabase', () => ({
  get supabase() {
    return supabaseValue;
  },
}));

async function importEvents() {
  return import('./events');
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  calendar_id: 'c1',
  title: 'MTG',
  all_day: false,
  starts_at: '2026-09-08T01:00:00Z',
  ends_at: '2026-09-08T02:00:00Z',
  event_date: null,
  note: null,
  source: 'local',
  reminder_minutes: null,
  is_secret: false,
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  queryResult = { data: null, error: null };
  supabaseValue = { from };
  from.mockReset();
  from.mockImplementation(() => makeChain());
});

describe('events.ts', () => {
  it('listEvents: 行を camelCase に変換し、deleted_at で絞る', async () => {
    queryResult = {
      data: [
        row(),
        row({
          id: 'e2',
          all_day: true,
          starts_at: null,
          ends_at: null,
          event_date: '2026-09-09',
        }),
      ],
      error: null,
    };
    const { listEvents } = await importEvents();
    const r = await listEvents();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toMatchObject({
        id: 'e1',
        allDay: false,
        startsAt: '2026-09-08T01:00:00Z',
      });
      expect(r.value[1]).toMatchObject({ id: 'e2', allDay: true, eventDate: '2026-09-09' });
    }
    expect(calls.map((c) => c.method)).toContain('is');
  });

  it('createEvent: 時刻付きは starts_at/ends_at を UTC ISO で insert する', async () => {
    queryResult = { data: row(), error: null };
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'c1',
      title: '  MTG  ',
      allDay: false,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
    });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      calendar_id: 'c1',
      title: 'MTG',
      all_day: false,
      starts_at: '2026-09-08T01:00:00Z',
      ends_at: '2026-09-08T02:00:00Z',
      event_date: null,
      source: 'local',
    });
  });

  it('createEvent: input.shift があるとシフト属性列を insert し、toEvent が写す', async () => {
    queryResult = {
      data: row({
        break_minutes: 30,
        hourly_wage: 1100,
        workplace_label: 'カフェ',
        shift_template_id: 'tpl-1',
      }),
      error: null,
    };
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'shift',
      title: '平日',
      allDay: false,
      startsAt: '2026-09-08T08:00:00Z',
      endsAt: '2026-09-08T13:00:00Z',
      shift: { breakMinutes: 30, hourlyWage: 1100, workplaceLabel: 'カフェ', shiftTemplateId: 'tpl-1' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        breakMinutes: 30,
        hourlyWage: 1100,
        workplaceLabel: 'カフェ',
        shiftTemplateId: 'tpl-1',
      });
    }
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      break_minutes: 30,
      hourly_wage: 1100,
      workplace_label: 'カフェ',
      shift_template_id: 'tpl-1',
    });
  });

  it('createEvent: shift なしのときシフト属性列は insert row に含めない', async () => {
    queryResult = { data: row(), error: null };
    const { createEvent } = await importEvents();
    await createEvent({
      calendarId: 'c1',
      title: '普通の予定',
      allDay: false,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
    });
    const insertRow = calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(insertRow).not.toHaveProperty('break_minutes');
    expect(insertRow).not.toHaveProperty('hourly_wage');
  });

  it('updateEvent: 送る row にシフト属性列は絶対に入らない(汎用編集で不変・AD-8)', async () => {
    queryResult = { data: row(), error: null };
    const { updateEvent } = await importEvents();
    await updateEvent(
      { id: 'e1', source: 'local' },
      { title: '改名', startsAt: '2026-09-08T03:00:00Z', endsAt: '2026-09-08T04:00:00Z', note: 'x' },
    );
    const updateRow = calls.find((c) => c.method === 'update')?.args[0] as Record<string, unknown>;
    expect(Object.keys(updateRow)).toEqual(
      expect.not.arrayContaining(['break_minutes', 'hourly_wage', 'workplace_label', 'shift_template_id']),
    );
  });

  it('createEvent: 終日は event_date のみ、時刻は null', async () => {
    queryResult = {
      data: row({ all_day: true, starts_at: null, ends_at: null, event_date: '2026-09-09' }),
      error: null,
    };
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'c1',
      title: '祝日',
      allDay: true,
      eventDate: '2026-09-09',
    });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      all_day: true,
      event_date: '2026-09-09',
      starts_at: null,
      ends_at: null,
    });
  });

  it('createEvent: isSecret を省略すると is_secret=false で insert する', async () => {
    queryResult = { data: row(), error: null };
    const { createEvent } = await importEvents();
    await createEvent({
      calendarId: 'c1',
      title: '普通の予定',
      allDay: false,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
    });
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ is_secret: false });
  });

  it('createEvent: isSecret=true を渡すと is_secret=true で insert する(spec-secret-mode)', async () => {
    queryResult = { data: row({ is_secret: true }), error: null };
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'c1',
      title: '秘密の予定',
      allDay: false,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
      isSecret: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isSecret).toBe(true);
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ is_secret: true });
  });

  it('updateEvent: isSecret を渡すと is_secret 列を update する', async () => {
    queryResult = { data: row({ is_secret: true }), error: null };
    const { updateEvent } = await importEvents();
    const r = await updateEvent({ id: 'e1', source: 'local' }, { isSecret: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isSecret).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ is_secret: true });
  });

  it('createEvent: 空タイトルを拒否する', async () => {
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'c1',
      title: '   ',
      allDay: false,
      startsAt: 'a',
      endsAt: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/invalid-title');
    expect(from).not.toHaveBeenCalled();
  });

  it('createEvent: 開始 > 終了 を拒否する', async () => {
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'c1',
      title: 'x',
      allDay: false,
      startsAt: '2026-09-08T03:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/invalid-time');
  });

  it('updateEvent: local は update、eq(id) を付ける', async () => {
    queryResult = { data: row({ title: '変更後' }), error: null };
    const { updateEvent } = await importEvents();
    const r = await updateEvent({ id: 'e1', source: 'local' }, { title: '変更後' });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ title: '変更後' });
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'e1']);
  });

  it('updateEvent: external は not-editable を返し、supabase に触れない', async () => {
    const { updateEvent } = await importEvents();
    const r = await updateEvent({ id: 'e1', source: 'google' }, { title: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/not-editable');
    expect(from).not.toHaveBeenCalled();
  });

  it('deleteEvent: local は deleted_at を立てる / external は拒否', async () => {
    queryResult = { data: null, error: null };
    const { deleteEvent } = await importEvents();
    expect((await deleteEvent({ id: 'e1', source: 'local' })).ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toHaveProperty('deleted_at');

    calls.length = 0;
    from.mockClear();
    const r = await deleteEvent({ id: 'e2', source: 'google' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/not-editable');
  });

  it('setEventReminder: 負値を拒否する(supabase に触れない)', async () => {
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', -1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/invalid-reminder');
    expect(from).not.toHaveBeenCalled();
  });

  it('setEventReminder: 非整数(小数)を拒否する', async () => {
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', 10.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/invalid-reminder');
    expect(from).not.toHaveBeenCalled();
  });

  it('setEventReminder: 上限(10080分 = 1週間)超えを拒否する', async () => {
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', 10081);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('event/invalid-reminder');
    expect(from).not.toHaveBeenCalled();
  });

  it('setEventReminder: 0分・上限ちょうど(10080分)は許可する', async () => {
    queryResult = { data: row({ reminder_minutes: 0 }), error: null };
    const { setEventReminder } = await importEvents();
    expect((await setEventReminder('e1', 0)).ok).toBe(true);

    calls.length = 0;
    from.mockClear();
    queryResult = { data: row({ reminder_minutes: 10080 }), error: null };
    expect((await setEventReminder('e1', 10080)).ok).toBe(true);
  });

  it('setEventReminder: source を問わず reminder_minutes 列だけを update する(Story 5.4)', async () => {
    queryResult = { data: row({ source: 'google', reminder_minutes: 30 }), error: null };
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', 30);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reminderMinutes).toBe(30);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ reminder_minutes: 30 });
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'e1']);
  });

  it('setEventReminder: null を渡すと解除する', async () => {
    queryResult = { data: row({ reminder_minutes: null }), error: null };
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', null);
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ reminder_minutes: null });
  });

  it('setEventReminder: クエリエラーは data/query に正規化する', async () => {
    queryResult = { data: null, error: { message: 'boom' } };
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', 30);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/query');
  });

  it('Supabase 未設定なら unavailable', async () => {
    supabaseValue = null;
    const { listEvents, createEvent } = await importEvents();
    expect((await listEvents()).ok).toBe(false);
    const r = await createEvent({
      calendarId: 'c1',
      title: 'x',
      allDay: true,
      eventDate: '2026-09-09',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/unavailable');
  });

  it('Postgrest エラーを AppError に正規化する', async () => {
    queryResult = { data: null, error: { message: 'boom', code: '23514' } };
    const { createEvent } = await importEvents();
    const r = await createEvent({
      calendarId: 'c1',
      title: 'x',
      allDay: false,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('data/query');
  });
});

describe('events.ts — オフライン(Story 1.6)', () => {
  beforeEach(() => vi.stubGlobal('navigator', { onLine: false }));
  afterEach(() => vi.unstubAllGlobals());

  it('setEventReminder はオフラインで data/offline を返す(狭い経路、outbox には積まない)', async () => {
    const { setEventReminder } = await importEvents();
    const r = await setEventReminder('e1', 30);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/offline');
    expect(from).not.toHaveBeenCalled();
  });

  it('listEvents はネットワーク障害でキャッシュを返す', async () => {
    const { cachePut } = await import('./cache');
    await cachePut('events', {
      id: 'c1', calendarId: 'c1', title: 'キャッシュ予定', allDay: false,
      startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z', eventDate: null,
      note: null, source: 'local',
      breakMinutes: null, hourlyWage: null, workplaceLabel: null, shiftTemplateId: null,
      reminderMinutes: null,
      isSecret: false,
      createdAt: '', updatedAt: '',
    });
    queryResult = { data: null, error: { message: 'Failed to fetch' } };
    const { listEvents } = await importEvents();
    const r = await listEvents();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((e) => e.title)).toEqual(['キャッシュ予定']);
  });

  it('createEvent はオフラインで outbox に積み、楽観行を返す(supabase に触れない)', async () => {
    const { createEvent } = await importEvents();
    const { listOutbox } = await import('./outbox');
    const r = await createEvent({
      calendarId: 'c1', title: '打合せ', allDay: false,
      startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(from).not.toHaveBeenCalled();
    const outbox = await listOutbox();
    expect(outbox[0]).toMatchObject({ entity: 'event', op: 'create' });
  });

  it('deleteEvent はオフラインで outbox に delete を積む', async () => {
    const { deleteEvent } = await importEvents();
    const { listOutbox } = await import('./outbox');
    const r = await deleteEvent({ id: 'e1', source: 'local' });
    expect(r.ok).toBe(true);
    expect((await listOutbox())[0]).toMatchObject({ op: 'delete', targetId: 'e1' });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('hideSecretEvents (pure、spec-secret-mode)', () => {
  const mk = (id: string, isSecret: boolean) => ({
    id, calendarId: 'c1', title: id, allDay: false,
    startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z', eventDate: null,
    note: null, source: 'local' as const,
    breakMinutes: null, hourlyWage: null, workplaceLabel: null, shiftTemplateId: null,
    reminderMinutes: null,
    isSecret,
    createdAt: '', updatedAt: '',
  });

  it('unlocked=false ならシークレット予定を除外する', async () => {
    const { hideSecretEvents } = await importEvents();
    const events = [mk('e1', false), mk('e2', true), mk('e3', false)];
    expect(hideSecretEvents(events, false).map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('unlocked=true なら全件そのまま返す', async () => {
    const { hideSecretEvents } = await importEvents();
    const events = [mk('e1', false), mk('e2', true)];
    expect(hideSecretEvents(events, true)).toEqual(events);
  });

  it('シークレット予定が無ければ何も変わらない', async () => {
    const { hideSecretEvents } = await importEvents();
    const events = [mk('e1', false), mk('e2', false)];
    expect(hideSecretEvents(events, false)).toEqual(events);
  });
});
