import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type AppError, type Result } from './result';
import { isNetworkError, isOffline } from './net';
import { cacheDelete, cacheGetAll, cachePut, cacheReplace } from './cache';
import {
  newLocalId,
  offlineCreateEvent,
  offlineDeleteEvent,
  offlineRestoreEvent,
  offlineUpdateEvent,
} from './offline-write';

/**
 * 予定の data-access レイヤ(AD-9 / AD-7 / AD-8 / AD-1)。
 * 真実源は Supabase Postgres。時刻は UTC の ISO 文字列で扱い、TZ 変換は表示層。
 * すべて Result を返し throw しない。snake↔camel はこのファイルだけ。
 * オフライン時: 読みは IndexedDB キャッシュ、書きは outbox キュー(offline-write.ts)。
 */

export type EventSource = 'local' | 'google' | 'device';

export interface EventItem {
  id: string;
  calendarId: string;
  title: string;
  allDay: boolean;
  /** 時刻付き予定の開始(UTC ISO)。終日なら null。 */
  startsAt: string | null;
  /** 時刻付き予定の終了(UTC ISO)。終日なら null。 */
  endsAt: string | null;
  /** 終日予定の日付(YYYY-MM-DD)。時刻付きなら null。 */
  eventDate: string | null;
  note: string | null;
  source: EventSource;
  /** シフト属性(AD-8)。シフト実体以外はすべて null。 */
  breakMinutes: number | null;
  hourlyWage: number | null;
  workplaceLabel: string | null;
  shiftTemplateId: string | null;
  /** 何分前に通知するか(Story 5.4、FR-20)。未設定は null。終日予定は常に null。 */
  reminderMinutes: number | null;
  /** シークレット予定か(ロック中は全画面から除外、spec-secret-mode)。既定 false。 */
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TimedInput {
  allDay: false;
  startsAt: string;
  endsAt: string;
}
interface AllDayInput {
  allDay: true;
  eventDate: string;
}

/** シフト実体を作るときだけ渡すシフト属性(AD-8)。省略時は書かない。 */
export interface ShiftAttributes {
  breakMinutes: number;
  hourlyWage: number;
  workplaceLabel?: string | null;
  shiftTemplateId?: string | null;
}

export type NewEventInput = {
  /** 省略時は DB 発番。オフライン作成・フラッシュ時はクライアント発番の id を渡す。 */
  id?: string;
  calendarId: string;
  title: string;
  note?: string | null;
  /** シフト実体を作るときだけ。汎用の予定作成では渡さない。 */
  shift?: ShiftAttributes;
  /** シークレット予定として作成するか(省略時 false)。spec-secret-mode。 */
  isSecret?: boolean;
} & (TimedInput | AllDayInput);

export type EventPatch = Partial<{
  calendarId: string;
  title: string;
  note: string | null;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  eventDate: string | null;
  isSecret: boolean;
}>;

export interface EventRange {
  /** この時刻以降に始まる/この日付以降(UTC ISO)。省略で全件。 */
  fromIso?: string;
  limit?: number;
}

/**
 * `events` テーブルの行形。`resyncAllReminders`(src/data/reminders.ts)が
 * リマインダー設定済みの予定を SELECT するときも、この形 + `toEvent` を再利用する
 * (snake↔camel 変換をこのファイルの外で重複させない)。
 */
export interface EventRow {
  id: string;
  calendar_id: string;
  title: string;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  event_date: string | null;
  note: string | null;
  source: EventSource;
  break_minutes: number | null;
  hourly_wage: number | null;
  workplace_label: string | null;
  shift_template_id: string | null;
  reminder_minutes: number | null;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
export const COLUMNS =
  'id,calendar_id,title,all_day,starts_at,ends_at,event_date,note,source,break_minutes,hourly_wage,workplace_label,shift_template_id,reminder_minutes,is_secret,created_at,updated_at';

export function toEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    allDay: row.all_day,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    eventDate: row.event_date,
    note: row.note,
    source: row.source,
    breakMinutes: row.break_minutes ?? null,
    hourlyWage: row.hourly_wage ?? null,
    workplaceLabel: row.workplace_label ?? null,
    shiftTemplateId: row.shift_template_id ?? null,
    reminderMinutes: row.reminder_minutes ?? null,
    isSecret: row.is_secret ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * ロック中(`unlocked=false`)はシークレット予定を除外する(pure、spec-secret-mode)。
 * 一覧・月・週・年・ホーム・給料見込みのすべての表示箇所で使う唯一の除外ロジック。
 */
export function hideSecretEvents(events: EventItem[], unlocked: boolean): EventItem[] {
  return unlocked ? events : events.filter((e) => !e.isSecret);
}

function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
}

/**
 * local 予定の書き込み先が自作カレンダーか確認する。
 * 外部予定の同期経路はこの関数を通らず、Google/端末側の取り込みを壊さない。
 * オフラインでは local と確認できるキャッシュが無い場合も fail closed にする。
 */
async function validateWritableCalendar(calendarId: string): Promise<AppError | null> {
  if (isOffline()) {
    const cached = (await cacheGetAll('calendars')).find((calendar) => calendar.id === calendarId);
    return !cached || cached.source !== 'local'
      ? appError('event/calendar-not-writable', 'event/calendar-not-writable')
      : null;
  }

  try {
    const { data, error } = await supabase!
      .from('calendars')
      .select('source')
      .eq('id', calendarId)
      .maybeSingle();
    if (error) {
      // source を確認できない状態で外部へ書かない。恒久エラーはそのまま表示する。
      if (isNetworkError(error)) return appError('data/offline', 'data/offline', error);
      return fromPostgrest(error);
    }
    const source = (data as { source?: string } | null)?.source;
    if (source !== 'local') {
      return appError('event/calendar-not-writable', 'event/calendar-not-writable');
    }
    return null;
  } catch (error) {
    if (isNetworkError(error)) return appError('data/offline', 'data/offline', error);
    return appError('data/query', 'data/query', error);
  }
}

interface EventInputShape {
  title: string;
  allDay?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  eventDate?: string | null;
}

/** 入力の妥当性。問題なければ null。表示層向けの messageKey を持つ AppError を返す。 */
export function validateEventInput(input: EventInputShape): AppError | null {
  if (input.title.trim().length < 1 || input.title.trim().length > 200) {
    return appError('event/invalid-title', 'event/invalid-title');
  }
  if (input.allDay) {
    if (!input.eventDate) return appError('event/invalid-date', 'event/invalid-date');
  } else {
    if (!input.startsAt || !input.endsAt) {
      return appError('event/invalid-time', 'event/invalid-time');
    }
    if (input.startsAt > input.endsAt) {
      return appError('event/invalid-time', 'event/invalid-time');
    }
  }
  return null;
}

function rowFromInput(input: NewEventInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    calendar_id: input.calendarId,
    title: input.title.trim(),
    note: input.note?.trim() || null,
    all_day: input.allDay,
    source: 'local' as const,
    is_secret: input.isSecret ?? false,
  };
  if (input.id) base.id = input.id;
  if (input.shift) {
    base.break_minutes = input.shift.breakMinutes;
    base.hourly_wage = input.shift.hourlyWage;
    base.workplace_label = input.shift.workplaceLabel?.trim() || null;
    base.shift_template_id = input.shift.shiftTemplateId ?? null;
  }
  return input.allDay
    ? { ...base, event_date: input.eventDate, starts_at: null, ends_at: null }
    : { ...base, starts_at: input.startsAt, ends_at: input.endsAt, event_date: null };
}

export async function listEvents(range: EventRange = {}): Promise<Result<EventItem[]>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) return ok(await cacheGetAll('events'));
  let query = selectActive('events', COLUMNS)
    .order('all_day', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: false })
    .order('event_date', { ascending: true });
  if (range.fromIso) {
    query = query.or(
      `starts_at.gte.${range.fromIso},event_date.gte.${range.fromIso.slice(0, 10)}`,
    );
  }
  if (range.limit) query = query.limit(range.limit);

  try {
    const { data, error } = await query;
    if (error) {
      if (isNetworkError(error)) return ok(await cacheGetAll('events'));
      return err(fromPostgrest(error));
    }
    const mapped = (data as unknown as EventRow[]).map(toEvent);
    if (!range.fromIso && !range.limit) await cacheReplace('events', mapped);
    else for (const row of mapped) await cachePut('events', row);
    return ok(mapped);
  } catch (e) {
    if (isNetworkError(e)) return ok(await cacheGetAll('events'));
    return err(appError('data/query', 'data/query', e));
  }
}

export async function createEvent(input: NewEventInput): Promise<Result<EventItem>> {
  if (!supabase) return err(UNAVAILABLE);
  const invalid = validateEventInput(input);
  if (invalid) return err(invalid);
  const calendarError = await validateWritableCalendar(input.calendarId);
  if (calendarError) return err(calendarError);
  if (isOffline()) return offlineCreateEvent(input.id ?? newLocalId(), input);

  try {
    const { data, error } = await supabase
      .from('events')
      .insert(rowFromInput(input))
      .select(COLUMNS)
      .single();
    if (error) {
      if (isNetworkError(error)) return offlineCreateEvent(input.id ?? newLocalId(), input);
      return err(fromPostgrest(error));
    }
    const row = toEvent(data as EventRow);
    await cachePut('events', row);
    return ok(row);
  } catch (e) {
    if (isNetworkError(e)) return offlineCreateEvent(input.id ?? newLocalId(), input);
    return err(appError('data/query', 'data/query', e));
  }
}

/** patch に含まれる項目だけを検証する。 */
export function validateEventPatch(patch: EventPatch): AppError | null {
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 1 || t.length > 200)
      return appError('event/invalid-title', 'event/invalid-title');
  }
  const touchesTime =
    patch.allDay !== undefined ||
    patch.startsAt !== undefined ||
    patch.endsAt !== undefined ||
    patch.eventDate !== undefined;
  if (touchesTime) {
    if (patch.allDay === true) {
      if (!patch.eventDate) return appError('event/invalid-date', 'event/invalid-date');
    } else if (patch.allDay === false) {
      if (!patch.startsAt || !patch.endsAt || patch.startsAt > patch.endsAt) {
        return appError('event/invalid-time', 'event/invalid-time');
      }
    } else if (
      patch.startsAt !== undefined &&
      patch.endsAt !== undefined &&
      patch.startsAt !== null &&
      patch.endsAt !== null &&
      patch.startsAt > patch.endsAt
    ) {
      return appError('event/invalid-time', 'event/invalid-time');
    }
  }
  return null;
}

export async function updateEvent(
  current: Pick<EventItem, 'id' | 'source'>,
  patch: EventPatch,
): Promise<Result<EventItem>> {
  if (!supabase) return err(UNAVAILABLE);
  if (current.source !== 'local') {
    return err(appError('event/not-editable', 'event/not-editable'));
  }
  const invalid = validateEventPatch(patch);
  if (invalid) return err(invalid);
  if (patch.calendarId !== undefined) {
    const calendarError = await validateWritableCalendar(patch.calendarId);
    if (calendarError) return err(calendarError);
  }
  if (isOffline()) return offlineUpdateEvent(current.id, patch);

  const row: Record<string, unknown> = {};
  if (patch.calendarId !== undefined) row.calendar_id = patch.calendarId;
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  if (patch.allDay !== undefined) row.all_day = patch.allDay;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.eventDate !== undefined) row.event_date = patch.eventDate;
  if (patch.isSecret !== undefined) row.is_secret = patch.isSecret;

  try {
    const { data, error } = await supabase
      .from('events')
      .update(row)
      .eq('id', current.id)
      .select(COLUMNS)
      .single();
    if (error) {
      if (isNetworkError(error)) return offlineUpdateEvent(current.id, patch);
      return err(fromPostgrest(error));
    }
    const updated = toEvent(data as EventRow);
    await cachePut('events', updated);
    return ok(updated);
  } catch (e) {
    if (isNetworkError(e)) return offlineUpdateEvent(current.id, patch);
    return err(appError('data/query', 'data/query', e));
  }
}

/** `reminder_minutes` の上限(1週間)。マイグレーションの CHECK 制約と同じ値。 */
const REMINDER_MINUTES_MAX = 10080;

/**
 * リマインダーの妥当性。問題なければ null。`validateEventInput`/`validateEventPatch` と
 * 同じパターン ── 表示層向けの messageKey を持つ AppError を返す。DB の CHECK 制約
 * (0以上10080以下)と同じ範囲をクライアント側でも検証し、生の PostgrestError が
 * そのまま表示に漏れないようにする。
 */
export function validateReminderMinutes(minutes: number | null): AppError | null {
  if (minutes === null) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > REMINDER_MINUTES_MAX) {
    return appError('event/invalid-reminder', 'event/invalid-reminder');
  }
  return null;
}

/**
 * リマインダー(`reminder_minutes`)だけを書き換える狭い経路(Story 5.4、FR-20)。
 * `updateEvent` と違い `source` を問わない(取り込み予定にもリマインダーは設定できる。
 * AD-2 の「取り込み予定は他の列を書けない」という一方向原則は、書く列をこの1つに
 * 絞ることで維持する)。オフライン時はキューに積まず即座に data/offline を返す
 * (このアプリの他の書き込みと違い、outbox の再生時に `source!=='local'` チェックへ
 * 衝突なく載せる仕組みが無いため、狭い経路のまま単純にオンライン専用にする)。
 */
export async function setEventReminder(
  eventId: string,
  minutes: number | null,
): Promise<Result<EventItem>> {
  if (!supabase) return err(UNAVAILABLE);
  const invalid = validateReminderMinutes(minutes);
  if (invalid) return err(invalid);
  if (isOffline()) return err(appError('data/offline', 'data/offline'));

  try {
    const { data, error } = await supabase
      .from('events')
      .update({ reminder_minutes: minutes })
      .eq('id', eventId)
      .select(COLUMNS)
      .single();
    if (error) {
      if (isNetworkError(error)) return err(appError('data/offline', 'data/offline', error));
      return err(fromPostgrest(error));
    }
    const updated = toEvent(data as EventRow);
    await cachePut('events', updated);
    return ok(updated);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

export async function deleteEvent(
  current: Pick<EventItem, 'id' | 'source'>,
): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  if (current.source !== 'local') {
    return err(appError('event/not-editable', 'event/not-editable'));
  }
  if (isOffline()) return offlineDeleteEvent(current.id);

  try {
    const { error } = await supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', current.id);
    if (error) {
      if (isNetworkError(error)) return offlineDeleteEvent(current.id);
      return err(fromPostgrest(error));
    }
    await cacheDelete('events', current.id);
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e)) return offlineDeleteEvent(current.id);
    return err(appError('data/query', 'data/query', e));
  }
}

export async function restoreEvent(event: EventItem): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) return offlineRestoreEvent(event);

  try {
    const { error } = await supabase
      .from('events')
      .update({ deleted_at: null })
      .eq('id', event.id);
    if (error) {
      if (isNetworkError(error)) return offlineRestoreEvent(event);
      return err(fromPostgrest(error));
    }
    await cachePut('events', event);
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e)) return offlineRestoreEvent(event);
    return err(appError('data/query', 'data/query', e));
  }
}
