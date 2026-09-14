import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appError, err, ok } from './result';
import type { Calendar } from './calendars';
import type { EventItem } from './events';
import type { ShiftTemplate } from './shift-templates';

const listCalendars = vi.fn();
const listEvents = vi.fn();
const listShiftTemplates = vi.fn();

vi.mock('./calendars', () => ({ listCalendars: () => listCalendars() }));
vi.mock('./events', () => ({ listEvents: () => listEvents() }));
vi.mock('./shift-templates', () => ({ listShiftTemplates: () => listShiftTemplates() }));

const { buildExportBundle } = await import('./export');

const tpl = (over: Partial<ShiftTemplate> = {}): ShiftTemplate => ({
  id: 't1',
  name: '平日',
  startLocal: '17:00',
  endLocal: '22:00',
  breakMinutes: 30,
  hourlyWage: 1100,
  workplaceLabel: null,
  color: '#009E73',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: 'MTG',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

beforeEach(() => {
  listCalendars.mockReset();
  listEvents.mockReset();
  listShiftTemplates.mockReset();
  listShiftTemplates.mockResolvedValue(ok([]));
});

describe('buildExportBundle', () => {
  it('ローカルのカレンダー・予定をソートしてバンドルにする', async () => {
    listCalendars.mockResolvedValue(
      ok([cal({ id: 'b', createdAt: '2026-09-02T00:00:00Z' }), cal({ id: 'a', createdAt: '2026-09-01T00:00:00Z' })]),
    );
    listEvents.mockResolvedValue(
      ok([
        ev({ id: 'late', calendarId: 'a', startsAt: '2026-09-09T00:00:00Z', endsAt: '2026-09-09T01:00:00Z' }),
        ev({ id: 'early', calendarId: 'b', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-08T01:00:00Z' }),
      ]),
    );
    const r = await buildExportBundle();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ app: 'calendar-app', schemaVersion: 2 });
    expect(r.value.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.value.calendars.map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.value.events.map((e) => e.id)).toEqual(['early', 'late']);
  });

  it('お気に入りシフトのテンプレを createdAt 順で含める', async () => {
    listCalendars.mockResolvedValue(ok([cal()]));
    listEvents.mockResolvedValue(ok([]));
    listShiftTemplates.mockResolvedValue(
      ok([
        tpl({ id: 'later', createdAt: '2026-09-05T00:00:00Z' }),
        tpl({ id: 'earlier', createdAt: '2026-09-01T00:00:00Z' }),
      ]),
    );
    const r = await buildExportBundle();
    expect(r.ok && r.value.shiftTemplates.map((t) => t.id)).toEqual(['earlier', 'later']);
  });

  it('listShiftTemplates が err なら伝播する', async () => {
    listCalendars.mockResolvedValue(ok([cal()]));
    listEvents.mockResolvedValue(ok([]));
    listShiftTemplates.mockResolvedValue(err(appError('data/query', 'data/query')));
    const r = await buildExportBundle();
    expect(r.ok).toBe(false);
  });

  it('取り込んだ外部予定・外部カレンダーは含めない', async () => {
    listCalendars.mockResolvedValue(ok([cal({ id: 'local' }), cal({ id: 'g', source: 'google' })]));
    listEvents.mockResolvedValue(
      ok([
        ev({ id: 'mine', calendarId: 'local' }),
        ev({ id: 'imported', source: 'google', calendarId: 'local' }),
      ]),
    );
    const r = await buildExportBundle();
    expect(r.ok && r.value.calendars.map((c) => c.id)).toEqual(['local']);
    expect(r.ok && r.value.events.map((e) => e.id)).toEqual(['mine']);
  });

  it('書き出すカレンダーに属さない予定(削除済みカレンダーの取り残し)は含めない', async () => {
    listCalendars.mockResolvedValue(ok([cal({ id: 'live' })]));
    listEvents.mockResolvedValue(
      ok([ev({ id: 'keep', calendarId: 'live' }), ev({ id: 'orphan', calendarId: 'gone' })]),
    );
    const r = await buildExportBundle();
    expect(r.ok && r.value.events.map((e) => e.id)).toEqual(['keep']);
  });

  it('予定ゼロでも成功する(events: [])', async () => {
    listCalendars.mockResolvedValue(ok([cal()]));
    listEvents.mockResolvedValue(ok([]));
    const r = await buildExportBundle();
    expect(r.ok && r.value.events).toEqual([]);
  });

  it('listEvents が err なら伝播する', async () => {
    listCalendars.mockResolvedValue(ok([cal()]));
    listEvents.mockResolvedValue(err(appError('data/query', 'data/query')));
    const r = await buildExportBundle();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.messageKey).toBe('data/query');
  });

  it('listCalendars が err なら listEvents を呼ばず err', async () => {
    listCalendars.mockResolvedValue(err(appError('data/unavailable', 'data/unavailable')));
    const r = await buildExportBundle();
    expect(r.ok).toBe(false);
    expect(listEvents).not.toHaveBeenCalled();
  });
});
