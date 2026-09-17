import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err, appError } from '@/data/result';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';

/**
 * widget.ts の検証。`buildFeaturedWidgetPayload` は純関数なので実物の `@core`/
 * `@/lib/calendar-view` を使う(`useFeaturedEvents.test.ts` と同じ方針)。
 * `refreshFeaturedWidget` は `@capacitor/core` / `capacitor-widget-bridge` /
 * `@/data/events` / `@/data/calendars` をモックする。
 */

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: (...a: unknown[]) => isNativePlatform(...a),
    getPlatform: () => getPlatform(),
  },
}));

const setItem = vi.fn();
const setRegisteredWidgets = vi.fn();
const reloadAllTimelines = vi.fn();
vi.mock('capacitor-widget-bridge', () => ({
  WidgetBridgePlugin: {
    setItem: (...a: unknown[]) => setItem(...a),
    setRegisteredWidgets: (...a: unknown[]) => setRegisteredWidgets(...a),
    reloadAllTimelines: (...a: unknown[]) => reloadAllTimelines(...a),
  },
}));

const listEvents = vi.fn();
vi.mock('@/data/events', async (importOriginal) => {
  // `hideSecretEvents` は実装(pure関数)をそのまま使う。`listEvents` だけ差し替える。
  const actual = await importOriginal<typeof import('@/data/events')>();
  return { ...actual, listEvents: (...a: unknown[]) => listEvents(...a) };
});

const listCalendars = vi.fn();
vi.mock('@/data/calendars', () => ({
  listCalendars: (...a: unknown[]) => listCalendars(...a),
}));

const { buildFeaturedWidgetPayload, refreshFeaturedWidget } = await import('./widget');

const cal = (over: Partial<Calendar>): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#0072B2',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const ev = (over: Partial<EventItem>): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '会議',
  allDay: false,
  startsAt: '2026-09-08T06:00:00.000Z',
  endsAt: '2026-09-08T07:00:00.000Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
  isSecret: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('buildFeaturedWidgetPayload', () => {
  const NOW = '2026-09-08T03:00:00.000Z';

  it('表示オンのカレンダーの予定を優先度順で最大3件、5フィールドの形に整形する', () => {
    const calendars = [
      cal({ id: 'high', priority: 0 }),
      cal({ id: 'low', name: '私用', priority: 1 }),
    ];
    const events = [
      ev({ id: 'a', calendarId: 'low', startsAt: '2026-09-08T05:00:00.000Z' }),
      ev({ id: 'b', calendarId: 'high', startsAt: '2026-09-08T09:00:00.000Z' }),
    ];
    const payload = buildFeaturedWidgetPayload(events, calendars, NOW);
    expect(payload.map((p) => p.id)).toEqual(['b', 'a']);
    expect(payload[0]).toEqual({
      id: 'b',
      calendarName: '仕事',
      colorHex: '#0072B2',
      startsAtIso: '2026-09-08T09:00:00.000Z',
      allDay: false,
      schemaVersion: 1,
    });
  });

  it('ミリ秒無しISO(Supabase/PostgRESTの標準形)もミリ秒付きへ正規化する(レビュー指摘、HIGH)', () => {
    // src/data/events.ts の toEvent() は starts_at をそのまま渡すため、実データは
    // ミリ秒無し('...T09:00:00Z')が標準形。素通しするとネイティブ側
    // (FeaturedEventsWidget.kt)の固定書式パーサが失敗し「終日」に誤フォールバックする。
    const calendars = [cal({})];
    const events = [ev({ id: 'e1', startsAt: '2026-09-08T09:00:00Z' })];
    const payload = buildFeaturedWidgetPayload(events, calendars, NOW);
    expect(payload[0]!.startsAtIso).toBe('2026-09-08T09:00:00.000Z');
  });

  it('表示オフのカレンダーの予定は除外する', () => {
    const calendars = [
      cal({ id: 'shown', isVisible: true }),
      cal({ id: 'hidden', isVisible: false }),
    ];
    const events = [
      ev({ id: 'v', calendarId: 'shown', startsAt: '2026-09-08T09:00:00.000Z' }),
      ev({ id: 'h', calendarId: 'hidden', startsAt: '2026-09-08T08:00:00.000Z' }),
    ];
    const payload = buildFeaturedWidgetPayload(events, calendars, NOW);
    expect(payload.map((p) => p.id)).toEqual(['v']);
  });

  it('4件以上あっても上限3件で打ち切る(count は受け取らず常に3固定)', () => {
    const calendars = [cal({ id: 'c1' })];
    const events = [9, 10, 11, 12].map((h) =>
      ev({ id: `e${h}`, startsAt: `2026-09-08T${String(h).padStart(2, '0')}:00:00.000Z` }),
    );
    const payload = buildFeaturedWidgetPayload(events, calendars, NOW);
    expect(payload.map((p) => p.id)).toEqual(['e9', 'e10', 'e11']);
  });

  it('終日予定は allDay:true、startsAtIso はその日のローカル00:00の ISO', () => {
    const calendars = [cal({})];
    const events = [ev({ id: 'a1', allDay: true, startsAt: null, eventDate: '2026-09-20' })];
    const payload = buildFeaturedWidgetPayload(events, calendars, NOW);
    expect(payload[0]).toMatchObject({ id: 'a1', allDay: true });
    // ローカル00:00の瞬間を UTC ISO にした値と一致する(new Date(2026,8,20).toISOString() と同じ計算)。
    expect(payload[0]!.startsAtIso).toBe(new Date(2026, 8, 20).toISOString());
  });

  it('シークレット予定は除外する(ロック/解除の概念が無いウィジェットでは常に除外、spec-secret-mode)', () => {
    const calendars = [cal({})];
    const events = [
      ev({ id: 'secret', isSecret: true, startsAt: '2026-09-08T09:00:00.000Z' }),
      ev({ id: 'normal', isSecret: false, startsAt: '2026-09-08T08:00:00.000Z' }),
    ];
    const payload = buildFeaturedWidgetPayload(events, calendars, NOW);
    expect(payload.map((p) => p.id)).toEqual(['normal']);
  });

  it('対象0件なら空配列', () => {
    const calendars = [cal({})];
    const past = [
      ev({
        id: 'p',
        startsAt: '2026-09-08T01:00:00.000Z',
        endsAt: '2026-09-08T02:00:00.000Z',
      }),
    ];
    const payload = buildFeaturedWidgetPayload(past, calendars, NOW);
    expect(payload).toEqual([]);
  });
});

describe('refreshFeaturedWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T03:00:00.000Z'));
    isNativePlatform.mockReset();
    getPlatform.mockReset().mockReturnValue('android');
    setItem.mockReset().mockResolvedValue({ results: true });
    setRegisteredWidgets.mockReset().mockResolvedValue({ results: true });
    reloadAllTimelines.mockReset().mockResolvedValue({ results: true });
    listEvents.mockReset();
    listCalendars.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Web(非ネイティブ)では何もしない', async () => {
    isNativePlatform.mockReturnValue(false);
    await refreshFeaturedWidget();
    expect(listEvents).not.toHaveBeenCalled();
    expect(listCalendars).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ネイティブでは listEvents/listCalendars を取り直し、setRegisteredWidgets→setItem→reloadAllTimelines の順に呼ぶ', async () => {
    isNativePlatform.mockReturnValue(true);
    listEvents.mockResolvedValue(ok([ev({ id: 'e1', startsAt: '2026-09-08T06:00:00.000Z' })]));
    listCalendars.mockResolvedValue(ok([cal({})]));

    await refreshFeaturedWidget();

    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(listCalendars).toHaveBeenCalledTimes(1);
    expect(setRegisteredWidgets).toHaveBeenCalledWith({
      widgets: ['jp.ryo.calendarapp.widget.FeaturedEventsWidgetReceiver'],
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    const arg = setItem.mock.calls[0]![0];
    expect(arg.key).toBe('featuredEvents');
    expect(arg.group).toBe('group.jp.ryo.calendarapp.widget');
    expect(JSON.parse(arg.value)).toEqual([
      expect.objectContaining({ id: 'e1', schemaVersion: 1 }),
    ]);
    expect(reloadAllTimelines).toHaveBeenCalledTimes(1);

    const order = [setRegisteredWidgets, setItem, reloadAllTimelines].map(
      (fn) => fn.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
  });

  it('listEvents が失敗したら何も書き込まず、警告ログを出す(catch節と対称)', async () => {
    isNativePlatform.mockReturnValue(true);
    listEvents.mockResolvedValue(err(appError('data/query', 'data/query')));
    listCalendars.mockResolvedValue(ok([cal({})]));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await refreshFeaturedWidget();
    expect(setItem).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'widget: refreshFeaturedWidget failed',
      expect.any(String),
    );
    warn.mockRestore();
  });

  it('iOSではAndroid専用APIが使えなくても共有ストレージへ書き込み再描画する', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    setRegisteredWidgets.mockRejectedValue(new Error('UNIMPLEMENTED'));
    listEvents.mockResolvedValue(ok([ev({ id: 'ios-event' })]));
    listCalendars.mockResolvedValue(ok([cal({})]));

    await refreshFeaturedWidget();

    expect(setRegisteredWidgets).not.toHaveBeenCalled();
    expect(setItem).toHaveBeenCalledWith({
      key: 'featuredEvents',
      group: 'group.jp.ryo.calendarapp.widget',
      value: expect.any(String),
    });
    expect(JSON.parse(setItem.mock.calls[0]![0].value)[0].id).toBe('ios-event');
    expect(reloadAllTimelines).toHaveBeenCalledTimes(1);
    expect(setItem.mock.invocationCallOrder[0]).toBeLessThan(
      reloadAllTimelines.mock.invocationCallOrder[0]!,
    );
  });

  it('listCalendars が失敗したら何も書き込まず、警告ログを出す', async () => {
    isNativePlatform.mockReturnValue(true);
    listEvents.mockResolvedValue(ok([]));
    listCalendars.mockResolvedValue(err(appError('data/query', 'data/query')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await refreshFeaturedWidget();
    expect(setItem).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'widget: refreshFeaturedWidget failed',
      expect.any(String),
    );
    warn.mockRestore();
  });

  it('WidgetBridgePlugin の呼び出しが例外を投げても投げ返さない(警告ログのみ)', async () => {
    isNativePlatform.mockReturnValue(true);
    listEvents.mockResolvedValue(ok([]));
    listCalendars.mockResolvedValue(ok([]));
    setRegisteredWidgets.mockRejectedValue(new Error('boom'));

    await expect(refreshFeaturedWidget()).resolves.toBeUndefined();
  });

  it('実行中に再度呼ばれても新たな listEvents/listCalendars は起こさず、進行中の Promise を共有する(device-sync.ts の inFlight と同じガード)', async () => {
    isNativePlatform.mockReturnValue(true);
    let resolveEvents!: (v: unknown) => void;
    listEvents.mockReturnValue(
      new Promise((resolve) => {
        resolveEvents = resolve;
      }),
    );
    listCalendars.mockResolvedValue(ok([cal({})]));

    const first = refreshFeaturedWidget();
    const second = refreshFeaturedWidget();
    expect(listEvents).toHaveBeenCalledTimes(1);

    resolveEvents(ok([ev({ id: 'e1', startsAt: '2026-09-08T06:00:00.000Z' })]));
    await Promise.all([first, second]);

    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);

    // 完了後に呼べば新たな実行が起こる(使い回しっぱなしにならない)。
    await refreshFeaturedWidget();
    expect(listEvents).toHaveBeenCalledTimes(2);
  });
});
