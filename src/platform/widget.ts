import { Capacitor } from '@capacitor/core';
import { WidgetBridgePlugin } from 'capacitor-widget-bridge';
import { selectFeaturedEvents } from '@core';
import { hideSecretEvents, listEvents, type EventItem } from '@/data/events';
import { listCalendars, type Calendar } from '@/data/calendars';
import { EXTERNAL_DEFAULT_COLOR } from '@/data/calendar-colors';
import { makePriorityOf } from '@/lib/calendar-view';
import { getLanguage, type Language } from '@/i18n';
import { localDateOf } from '@/lib/datetime';

/**
 * ホーム画面ウィジェットのデータブリッジ(Story 5.6、ARCHITECTURE-SPINE Epic5 AD-12)。
 * `deviceCalendar.ts`/`deepLink.ts` と同じ層分離 ── 選抜ロジック(`selectFeaturedEvents`)
 * の呼び出しと JSON 整形はここ(JS側)だけで行い、ネイティブ側(Android の
 * `FeaturedEventsWidget.kt`)はサイズに応じて渡された配列を切り詰めて表示するだけ
 * (AD-12「選抜ロジックは共有する」)。
 *
 * `WIDGET_GROUP` は iOS App Group 識別子(AD-18)と同じ文字列を、Android では
 * SharedPreferences のファイル名として流用する(Story 5.5 との一貫性のため)。
 * `WIDGET_RECEIVER_FQCN` は Android の `GlanceAppWidgetReceiver` 実装
 * (`FeaturedEventsWidgetReceiver.kt`)の完全修飾クラス名と一致させること。
 *
 * Web(PWA)では `capacitor-widget-bridge` に web 実装が無い(このパッケージが
 * `registerPlugin` に web フォールバックを渡していない)。`refreshFeaturedWidget`
 * の冒頭で `Capacitor.isNativePlatform()` を確認し、ネイティブでなければ何もせず返す。
 */

const WIDGET_GROUP = 'group.jp.ryo.multicalendar.widget';
const WIDGET_ITEM_KEY = 'featuredEvents';
const CALENDAR_OVERVIEW_ITEM_KEY = 'calendarOverview';
/** `android/app/src/main/java/jp/ryo/calendarapp/widget/FeaturedEventsWidgetReceiver.kt` と同じ値。 */
const WIDGET_RECEIVER_FQCN = 'jp.ryo.multicalendar.widget.FeaturedEventsWidgetReceiver';
const WIDGET_RECEIVER_FQCNS = [
  WIDGET_RECEIVER_FQCN,
  'jp.ryo.multicalendar.widget.WeekEventsWidgetReceiver',
  'jp.ryo.multicalendar.widget.MonthEventsWidgetReceiver',
];
/** AD-12「常に上限3件を計算する」。ウィジェットの現在サイズでの実際の表示件数はネイティブ側が決める。 */
const WIDGET_LIMIT = 3;

/**
 * ウィジェットへ渡す1件分の JSON 形(AD-12 の4フィールド + 本ストーリーで追加した `allDay`)。
 * `id` はタップ時のディープリンク(`calendar-app://event/{id}`)に使うために必要
 * (Boundaries & Constraints / I-O Matrix の「ウィジェットタップ」要求を満たすための、
 * 仕様の Code Map に明記されていない補足フィールド。Design Notes 参照)。
 * 予定タイトルは含めない(FR-18/AD-12)。
 */
export interface FeaturedWidgetEventPayload {
  id: string;
  calendarName: string;
  colorHex: string;
  /** 時刻付きはその瞬間、終日はその日のローカル00:00の UTC ISO。 */
  startsAtIso: string;
  allDay: boolean;
  schemaVersion: 1;
}

export interface CalendarOverviewEventPayload {
  id: string;
  title: string;
  calendarName: string;
  colorHex: string;
  startDate: string;
  endDate: string;
  startsAtIso: string | null;
  allDay: boolean;
}

export interface CalendarOverviewPayload {
  schemaVersion: 1;
  updatedAtIso: string;
  language: Language;
  events: CalendarOverviewEventPayload[];
}

/** `event_date`(YYYY-MM-DD)をローカル00:00として解釈した UTC ISO(device-sync.ts の localDateStringToMs と対の形)。 */
function localMidnightIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toISOString();
}

/**
 * ウィジェット用の JSON ペイロードを組み立てる純関数(副作用・I/O なし)。
 * `useFeaturedEvents.ts` と同じレシピ(表示オンのカレンダーの予定だけを対象に
 * `selectFeaturedEvents` へ通す)だが、React フックではなく素の関数として提供する。
 *
 * シークレット予定は常に除外する(spec-secret-mode)。ネイティブのホーム画面ウィジェットには
 * ロック/解除の概念が無く(`SecretModeProvider` の `unlocked` はアプリ内のメモリ state のみで、
 * ウィジェット側には届かない)、ウィジェットは「アプリを開いていなくても見える」場所なので、
 * アプリ画面がロック中かどうかに関わらず `hideSecretEvents(events, false)` で固定して除外する。
 */
export function buildFeaturedWidgetPayload(
  events: EventItem[],
  calendars: Calendar[],
  now: string,
): FeaturedWidgetEventPayload[] {
  const calendarById = new Map(calendars.map((c) => [c.id, c]));
  const visibleIds = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
  const visible = hideSecretEvents(
    events.filter((e) => visibleIds.has(e.calendarId)),
    false,
  ).filter((event) => dateRangeForEvent(event) !== null);
  const featured = selectFeaturedEvents(
    visible,
    makePriorityOf(calendarById),
    now,
    WIDGET_LIMIT,
  );

  return featured.flatMap((event) => {
    if (!dateRangeForEvent(event)) return [];
    const calendar = calendarById.get(event.calendarId);
    return [{
      id: event.id,
      calendarName: calendar?.name ?? '不明なカレンダー',
      colorHex: calendar?.color ?? EXTERNAL_DEFAULT_COLOR,
      startsAtIso:
        event.allDay && event.eventDate
          ? localMidnightIso(event.eventDate)
          : // Supabase(PostgREST)の `starts_at` はミリ秒無し('...T01:00:00Z')が標準形。
            // ネイティブ側(FeaturedEventsWidget.kt)のパーサはミリ秒付きの固定書式を要求するため、
            // `Date` を経由してミリ秒付きの形へ正規化する(素通しすると時刻付き予定が「終日」に
            // 誤フォールバックする実害があった)。
            new Date(event.startsAt ?? now).toISOString(),
      allDay: event.allDay,
      schemaVersion: 1,
    }];
  });
}

function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) && localDateString(parsed) === value;
}

function localDateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateRangeForEvent(event: EventItem): {
  startDate: string;
  endDate: string;
  startsAtIso: string | null;
} | null {
  if (event.allDay) {
    if (!event.eventDate || !isLocalDate(event.eventDate)) return null;
    return { startDate: event.eventDate, endDate: event.eventDate, startsAtIso: null };
  }
  if (!event.startsAt) return null;
  const startMs = Date.parse(event.startsAt);
  if (!Number.isFinite(startMs)) return null;
  const startDate = localDateOf(new Date(startMs).toISOString());
  let endDate = startDate;
  if (event.endsAt) {
    const endMs = Date.parse(event.endsAt);
    if (!Number.isFinite(endMs) || endMs < startMs) return null;
    // 終了はexclusive。深夜0時終了なら前日までにする。
    endDate = localDateString(new Date(Math.max(startMs, endMs - 1)));
  }
  return { startDate, endDate, startsAtIso: new Date(startMs).toISOString() };
}

export function buildCalendarOverviewPayload(
  events: EventItem[],
  calendars: Calendar[],
  updatedAtIso: string,
  language: Language = getLanguage(),
): CalendarOverviewPayload {
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const visibleIds = new Set(calendars.filter((calendar) => calendar.isVisible).map((calendar) => calendar.id));
  const overviewEvents = events
    .filter((event) => visibleIds.has(event.calendarId) && !event.isSecret)
    .map((event) => {
      const range = dateRangeForEvent(event);
      const calendar = calendarById.get(event.calendarId);
      if (!range || !calendar) return null;
      return {
        id: event.id,
        title: event.title,
        calendarName: calendar.name,
        colorHex: calendar.color || EXTERNAL_DEFAULT_COLOR,
        ...range,
        allDay: event.allDay,
      } satisfies CalendarOverviewEventPayload;
    })
    .filter((event): event is CalendarOverviewEventPayload => event !== null)
    .sort((a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      Number(b.allDay) - Number(a.allDay) ||
      (a.startsAtIso ?? '').localeCompare(b.startsAtIso ?? '') ||
      a.id.localeCompare(b.id),
    );
  return { schemaVersion: 1, updatedAtIso, language, events: overviewEvents };
}

async function runRefreshFeaturedWidget(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const [eventsResult, calendarsResult] = await Promise.all([listEvents(), listCalendars()]);
    if (!eventsResult.ok || !calendarsResult.ok) {
      console.warn('widget: refreshFeaturedWidget failed', 'listEvents/listCalendars not ok');
      return;
    }

    const payload = buildFeaturedWidgetPayload(
      eventsResult.value,
      calendarsResult.value,
      new Date().toISOString(),
    );

    // setRegisteredWidgets はプラグインの静的フィールドに保持されるだけでプロセス再起動で
    // リセットされるため、毎回呼ぶ(冪等)。
    // iOS プラグインにはこの Android 専用メソッドが無い。
    if (Capacitor.getPlatform() === 'android') {
      await WidgetBridgePlugin.setRegisteredWidgets({ widgets: WIDGET_RECEIVER_FQCNS });
    }
    await WidgetBridgePlugin.setItem({
      key: WIDGET_ITEM_KEY,
      group: WIDGET_GROUP,
      value: JSON.stringify(payload),
    });
    if (Capacitor.getPlatform() === 'android') {
      const overview = buildCalendarOverviewPayload(
        eventsResult.value,
        calendarsResult.value,
        new Date().toISOString(),
      );
      await WidgetBridgePlugin.setItem({
        key: CALENDAR_OVERVIEW_ITEM_KEY,
        group: WIDGET_GROUP,
        value: JSON.stringify(overview),
      });
    }
    await WidgetBridgePlugin.reloadAllTimelines();
  } catch (e) {
    console.warn('widget: refreshFeaturedWidget failed', (e as Error)?.message);
  }
}

/** 実行中の呼び出しを共有しつつ、途中の更新要求は完了後に再実行する。 */
let inFlight: Promise<void> | null = null;
let refreshRequested = false;

/**
 * 代表予定をウィジェットへ反映する。呼び出し側の React state に依存せず、
 * `listEvents`/`listCalendars` を直接呼んで自己完結で取り直す
 * (`resyncAllReminders` と同じパターン)。
 *
 * フォアグラウンド復帰・Google/端末カレンダー同期完了・予定の作成/編集/削除/Undo の
 * 直後に呼ぶ(イベント駆動、AD-12)。全体を try/catch し、失敗しても警告ログのみで
 * 呼び出し側には影響させない。呼び出し側は fire-and-forget(`void refreshFeaturedWidget()`)
 * で呼ぶため、短時間に連続発火しても新しいデータが古いデータに上書きされないよう
 * 実行中の呼び出しがあれば同じ Promise を共有し、途中で来た要求は捨てずに再実行する。
 */
export function refreshFeaturedWidget(): Promise<void> {
  if (inFlight) {
    refreshRequested = true;
    return inFlight;
  }
  const run = (async () => {
    do {
      refreshRequested = false;
      await runRefreshFeaturedWidget();
    } while (refreshRequested);
  })().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}
