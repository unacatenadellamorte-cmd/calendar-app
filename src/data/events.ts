import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
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

export type EventSource = 'local' | 'google';

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
} & (TimedInput | AllDayInput);

export type EventPatch = Partial<{
  calendarId: string;
  title: string;
  note: string | null;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  eventDate: string | null;
}>;

export interface EventRange {
  /** この時刻以降に始まる/この日付以降(UTC ISO)。省略で全件。 */
  fromIso?: string;
  limit?: number;
}

interface EventRow {
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
  created_at: string;
  updated_at: string;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
const COLUMNS =
  'id,calendar_id,title,all_day,starts_at,ends_at,event_date,note,source,break_minutes,hourly_wage,workplace_label,shift_template_id,created_at,updated_at';

function toEvent(row: EventRow): EventItem {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
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
  let query = supabase
    .from('events')
    .select(COLUMNS)
    .is('deleted_at', null)
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
    const mapped = (data as EventRow[]).map(toEvent);
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
  if (isOffline()) return offlineUpdateEvent(current.id, patch);

  const row: Record<string, unknown> = {};
  if (patch.calendarId !== undefined) row.calendar_id = patch.calendarId;
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  if (patch.allDay !== undefined) row.all_day = patch.allDay;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.eventDate !== undefined) row.event_date = patch.eventDate;

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
