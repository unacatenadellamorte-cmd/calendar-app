import { Capacitor } from '@capacitor/core';
import { WidgetBridgePlugin } from 'capacitor-widget-bridge';
import { selectFeaturedEvents } from '@core';
import { listEvents, type EventItem } from '@/data/events';
import { listCalendars, type Calendar } from '@/data/calendars';
import { EXTERNAL_DEFAULT_COLOR } from '@/data/calendar-colors';
import { makePriorityOf } from '@/lib/calendar-view';

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

const WIDGET_GROUP = 'group.jp.ryo.calendarapp.widget';
const WIDGET_ITEM_KEY = 'featuredEvents';
/** `android/app/src/main/java/jp/ryo/calendarapp/widget/FeaturedEventsWidgetReceiver.kt` と同じ値。 */
const WIDGET_RECEIVER_FQCN = 'jp.ryo.calendarapp.widget.FeaturedEventsWidgetReceiver';
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

/** `event_date`(YYYY-MM-DD)をローカル00:00として解釈した UTC ISO(device-sync.ts の localDateStringToMs と対の形)。 */
function localMidnightIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toISOString();
}

/**
 * ウィジェット用の JSON ペイロードを組み立てる純関数(副作用・I/O なし)。
 * `useFeaturedEvents.ts` と同じレシピ(表示オンのカレンダーの予定だけを対象に
 * `selectFeaturedEvents` へ通す)だが、React フックではなく素の関数として提供する。
 */
export function buildFeaturedWidgetPayload(
  events: EventItem[],
  calendars: Calendar[],
  now: string,
): FeaturedWidgetEventPayload[] {
  const calendarById = new Map(calendars.map((c) => [c.id, c]));
  const visibleIds = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
  const visible = events.filter((e) => visibleIds.has(e.calendarId));
  const featured = selectFeaturedEvents(visible, makePriorityOf(calendarById), now, WIDGET_LIMIT);

  return featured.map((event) => {
    const calendar = calendarById.get(event.calendarId);
    return {
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
    };
  });
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
    await WidgetBridgePlugin.setRegisteredWidgets({ widgets: [WIDGET_RECEIVER_FQCN] });
    await WidgetBridgePlugin.setItem({
      key: WIDGET_ITEM_KEY,
      group: WIDGET_GROUP,
      value: JSON.stringify(payload),
    });
    await WidgetBridgePlugin.reloadAllTimelines();
  } catch (e) {
    console.warn('widget: refreshFeaturedWidget failed', (e as Error)?.message);
  }
}

/** 実行中の呼び出しがあれば同じ Promise を返す(`syncDeviceCalendarsNow` と同じ同時実行ガード)。 */
let inFlight: Promise<void> | null = null;

/**
 * 代表予定をウィジェットへ反映する。呼び出し側の React state に依存せず、
 * `listEvents`/`listCalendars` を直接呼んで自己完結で取り直す
 * (`resyncAllReminders` と同じパターン)。
 *
 * フォアグラウンド復帰・Google/端末カレンダー同期完了・予定の作成/編集/削除/Undo の
 * 直後に呼ぶ(イベント駆動、AD-12)。全体を try/catch し、失敗しても警告ログのみで
 * 呼び出し側には影響させない。呼び出し側は fire-and-forget(`void refreshFeaturedWidget()`)
 * で呼ぶため、短時間に連続発火しても新しいデータが古いデータに上書きされないよう
 * 実行中の呼び出しがあれば同じ Promise を共有する(`device-sync.ts` の `inFlight` と同じパターン)。
 */
export function refreshFeaturedWidget(): Promise<void> {
  if (inFlight) return inFlight;
  const run = runRefreshFeaturedWidget().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}
