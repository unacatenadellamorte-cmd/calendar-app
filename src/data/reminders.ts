import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { cancelReminder, getPendingReminders, isNotificationSupported, scheduleReminder } from '@/platform/reminders';
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
export type ReminderSyncStatus = 'ok' | 'past' | 'unsupported' | 'schedule-failed';

export async function syncReminderForEvent(event: EventItem): Promise<ReminderSyncStatus> {
  const id = deriveNotificationId(event.id);
  try {
    await cancelReminder(id);
  } catch (e) {
    console.warn('reminders: cancelReminder failed', (e as Error)?.message);
  }

  if (event.reminderMinutes == null || event.allDay || !event.startsAt) return 'ok';
  const startMs = Date.parse(event.startsAt);
  // startsAt が解釈不能(壊れたデータ等)なら NaN になり、以降の比較が常に false になって
  // 過去時刻ガードをすり抜けてしまう ── 明示的に弾いて schedule しない。
  if (Number.isNaN(startMs)) return 'past';
  const at = new Date(startMs - event.reminderMinutes * 60_000);
  if (at.getTime() <= Date.now()) return 'past';
  if (!isNotificationSupported()) return 'unsupported';

  try {
    await scheduleReminder({
      id,
      eventId: event.id,
      title: event.isSecret ? '予定の通知' : event.title,
      reminderMinutes: event.reminderMinutes,
      at,
    });
    return 'ok';
  } catch (e) {
    console.warn('reminders: scheduleReminder failed', (e as Error)?.message);
    return 'schedule-failed';
  }
}

/**
 * リマインダー設定済みの全予定を再同期する。Google/端末カレンダー同期の完了後に呼ぶ
 * (spec Design Notes: 変更検知はせず、対象を毎回 cancel→schedule し直す簡便法)。
 * 取得は安定ID順の件数つきページングで行い、完全な集合を得られない場合は
 * OS通知の一括照合へ進まない。失敗しても同期本体の結果には影響させない。
 */
const REMINDER_PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
  count: number | null;
}

async function readAllPages<T extends { id: string }>(
  readPage: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<T[] | null> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | null = null;
  let from = 0;
  while (expected === null || rows.length < expected) {
    const page = await readPage(from, from + REMINDER_PAGE_SIZE - 1);
    if (page.error || !page.data || page.count == null) return null;
    if (expected === null) expected = page.count;
    if (page.count !== expected) return null;
    if (page.count === 0 && page.data.length === 0) return [];
    if (page.data.length === 0) return null;
    for (const row of page.data) {
      if (ids.has(row.id)) return null;
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > expected) return null;
    from += page.data.length;
  }
  return rows.length === expected ? rows : null;
}

export async function resyncAllReminders(): Promise<void> {
  if (!supabase) return;
  try {
    const calendars = await readAllPages<{ id: string }>(async (from, to) =>
      await (selectActive('calendars', 'id', { count: 'exact' })
        .order('id', { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<{ id: string }>>),
    );
    if (!calendars) return;
    const data = await readAllPages<EventRow>(async (from, to) =>
      await (selectActive('events', COLUMNS, { count: 'exact' })
        .not('reminder_minutes', 'is', null)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<EventRow>>),
    );
    if (!data) return;
    const calendarIds = new Set(calendars.map((calendar) => calendar.id));
    const activeEvents = data.filter((row) => calendarIds.has(row.calendar_id));
    const activeEventIds = new Set(activeEvents.map((row) => row.id));
    if (isNotificationSupported()) {
      const pending = await getPendingReminders();
      for (const notification of pending) {
        const eventId =
          notification.extra && typeof notification.extra === 'object' && 'eventId' in notification.extra
            ? String(notification.extra.eventId)
            : null;
        if (!eventId) continue;
        if (!activeEventIds.has(eventId)) await cancelReminder(notification.id);
      }
    }
    for (const row of activeEvents) {
      await syncReminderForEvent(toEvent(row));
    }
  } catch (e) {
    console.warn('reminders: resyncAllReminders failed', (e as Error)?.message);
  }
}
