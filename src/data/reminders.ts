import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { cancelReminder, scheduleReminder } from '@/platform/reminders';
import { deriveNotificationId } from '@core';
import { COLUMNS, toEvent, type EventItem, type EventRow } from './events';

/**
 * リマインダー通知の同期(Story 5.4、ARCHITECTURE-SPINE Epic5)。
 * `reminder_minutes`(DB、events.ts)とローカル通知(platform/reminders.ts)を橋渡しする。
 * 通知IDは `packages/core` の `deriveNotificationId` だけを使う(Boundaries & Constraints)。
 *
 * ネイティブブリッジ呼び出し(cancel/schedule)は失敗しても投げない ── Web(PWA)や
 * 通知非対応ブラウザでは `@capacitor/local-notifications` の web シムが例外を投げ得るが、
 * `reminder_minutes` の DB 保存自体は通知の成否と独立して成功させる(spec I/O Matrix の
 * 「通知権限が無い」行と同じ考え方 ── 保存は常に成功、通知だけが出ないことがある)。
 */

/**
 * 1件の予定についてリマインダー通知を同期する。まず同じ導出IDで既存の通知を
 * cancel し、`reminderMinutes` が設定済み・時刻付き・開始が未来のときだけ
 * schedule し直す(終日・未設定・過去時刻は cancel のみで終わる)。
 */
export async function syncReminderForEvent(event: EventItem): Promise<void> {
  const id = deriveNotificationId(event.id);
  try {
    await cancelReminder(id);
  } catch (e) {
    console.warn('reminders: cancelReminder failed', (e as Error)?.message);
  }

  if (event.reminderMinutes == null || event.allDay || !event.startsAt) return;
  const startMs = Date.parse(event.startsAt);
  // startsAt が解釈不能(壊れたデータ等)なら NaN になり、以降の比較が常に false になって
  // 過去時刻ガードをすり抜けてしまう ── 明示的に弾いて schedule しない。
  if (Number.isNaN(startMs)) return;
  const at = new Date(startMs - event.reminderMinutes * 60_000);
  if (at.getTime() <= Date.now()) return;

  try {
    await scheduleReminder({ id, eventId: event.id, title: event.title, at });
  } catch (e) {
    console.warn('reminders: scheduleReminder failed', (e as Error)?.message);
  }
}

/** 安全マージン(暴走的な行数増加からの防御。device-sync.ts の EXISTING_EVENTS_LIMIT と同じ考え方)。 */
const REMINDER_EVENTS_LIMIT = 2000;

/**
 * リマインダー設定済みの全予定を再同期する。Google/端末カレンダー同期の完了後に呼ぶ
 * (spec Design Notes: 変更検知はせず、対象を毎回 cancel→schedule し直す簡便法)。
 * 失敗しても同期本体の結果には影響させない(呼び出し側は結果を待たなくてよい)。
 */
export async function resyncAllReminders(): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await selectActive('events', COLUMNS)
      .not('reminder_minutes', 'is', null)
      .limit(REMINDER_EVENTS_LIMIT)
      .returns<EventRow[]>();
    if (error || !data) return;
    for (const row of data) {
      await syncReminderForEvent(toEvent(row));
    }
  } catch (e) {
    console.warn('reminders: resyncAllReminders failed', (e as Error)?.message);
  }
}
