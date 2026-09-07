import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isPresetColor, SHIFT_CALENDAR_COLOR } from './calendar-colors';
import { isNetworkError, isOffline } from './net';
import { cacheDelete, cacheGetAll, cachePut, cacheReplace } from './cache';
import {
  newLocalId,
  offlineCreateCalendar,
  offlineDeleteCalendar,
  offlinePatchCalendar,
  offlineRestoreCalendar,
} from './offline-write';

/**
 * カレンダーの data-access レイヤ(ARCHITECTURE-SPINE AD-9 / AD-1)。
 * 真実源は Supabase Postgres。すべて Result を返し、throw しない。
 * snake_case(DB) ↔ camelCase(TS) 変換はこのファイルだけで行う。
 * オフライン時: 読みは IndexedDB キャッシュ、書きは outbox キュー(offline-write.ts)。
 */

export type CalendarSource = 'local' | 'google';

export interface Calendar {
  id: string;
  name: string;
  color: string;
  source: CalendarSource;
  isShift: boolean;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewCalendarInput {
  name: string;
  color: string;
  /** 省略時は DB 発番。オフライン作成・フラッシュ時はクライアント発番の id。 */
  id?: string;
}

interface CalendarRow {
  id: string;
  name: string;
  color: string;
  source: CalendarSource;
  is_shift: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
const COLUMNS = 'id,name,color,source,is_shift,is_visible,created_at,updated_at';

function toCalendar(row: CalendarRow): Calendar {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    source: row.source,
    isShift: row.is_shift,
    isVisible: row.is_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
}

function validateName(name: string): AppError | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return appError('calendar/invalid-name', 'calendar/invalid-name');
  }
  return null;
}

function validateColor(color: string): AppError | null {
  return isPresetColor(color)
    ? null
    : appError('calendar/invalid-color', 'calendar/invalid-color');
}

export async function listCalendars(): Promise<Result<Calendar[]>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) return ok(sortCalendars(await cacheGetAll('calendars')));
  try {
    const { data, error } = await supabase
      .from('calendars')
      .select(COLUMNS)
      .is('deleted_at', null)
      .order('is_shift', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      if (isNetworkError(error)) return ok(sortCalendars(await cacheGetAll('calendars')));
      return err(fromPostgrest(error));
    }
    const mapped = (data as CalendarRow[]).map(toCalendar);
    await cacheReplace('calendars', mapped);
    return ok(mapped);
  } catch (e) {
    if (isNetworkError(e)) return ok(sortCalendars(await cacheGetAll('calendars')));
    return err(appError('data/query', 'data/query', e));
  }
}

function sortCalendars(list: Calendar[]): Calendar[] {
  return [...list].sort(
    (a, b) =>
      Number(a.isShift) - Number(b.isShift) || a.createdAt.localeCompare(b.createdAt),
  );
}

export async function createCalendar(input: NewCalendarInput): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const nameError = validateName(input.name);
  if (nameError) return err(nameError);
  const colorError = validateColor(input.color);
  if (colorError) return err(colorError);
  if (isOffline()) {
    return offlineCreateCalendar(input.id ?? newLocalId(), input);
  }

  const row: Record<string, unknown> = {
    name: input.name.trim(),
    color: input.color,
    source: 'local',
  };
  if (input.id) row.id = input.id;
  try {
    const { data, error } = await supabase
      .from('calendars')
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) {
      if (isNetworkError(error)) return offlineCreateCalendar(input.id ?? newLocalId(), input);
      return err(fromPostgrest(error));
    }
    const created = toCalendar(data as CalendarRow);
    await cachePut('calendars', created);
    return ok(created);
  } catch (e) {
    if (isNetworkError(e)) return offlineCreateCalendar(input.id ?? newLocalId(), input);
    return err(appError('data/query', 'data/query', e));
  }
}

async function patchCalendar(
  id: string,
  op: string,
  dbPatch: Record<string, unknown>,
  localPatch: Partial<Calendar>,
  payload: unknown,
): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) return offlinePatchCalendar(id, op, localPatch, payload);
  try {
    const { data, error } = await supabase
      .from('calendars')
      .update(dbPatch)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) {
      if (isNetworkError(error)) return offlinePatchCalendar(id, op, localPatch, payload);
      return err(fromPostgrest(error));
    }
    const updated = toCalendar(data as CalendarRow);
    await cachePut('calendars', updated);
    return ok(updated);
  } catch (e) {
    if (isNetworkError(e)) return offlinePatchCalendar(id, op, localPatch, payload);
    return err(appError('data/query', 'data/query', e));
  }
}

export async function renameCalendar(id: string, name: string): Promise<Result<Calendar>> {
  const nameError = validateName(name);
  if (nameError) return err(nameError);
  return patchCalendar(id, 'rename', { name: name.trim() }, { name: name.trim() }, { name: name.trim() });
}

export async function recolorCalendar(id: string, color: string): Promise<Result<Calendar>> {
  const colorError = validateColor(color);
  if (colorError) return err(colorError);
  return patchCalendar(id, 'recolor', { color }, { color }, { color });
}

export async function setCalendarVisible(
  id: string,
  isVisible: boolean,
): Promise<Result<Calendar>> {
  return patchCalendar(
    id,
    'setVisible',
    { is_visible: isVisible },
    { isVisible },
    { isVisible },
  );
}

/** 論理削除。シフト用カレンダーは拒否する。 */
export async function deleteCalendar(
  calendar: Pick<Calendar, 'id' | 'isShift'>,
): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  if (calendar.isShift) {
    return err(appError('calendar/shift-undeletable', 'calendar/shift-undeletable'));
  }
  if (isOffline()) return offlineDeleteCalendar(calendar.id);

  try {
    const { error } = await supabase
      .from('calendars')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', calendar.id);
    if (error) {
      if (isNetworkError(error)) return offlineDeleteCalendar(calendar.id);
      return err(fromPostgrest(error));
    }
    await cacheDelete('calendars', calendar.id);
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e)) return offlineDeleteCalendar(calendar.id);
    return err(appError('data/query', 'data/query', e));
  }
}

/** 論理削除を取り消す(Undo)。 */
export async function restoreCalendar(calendar: Calendar): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) return offlineRestoreCalendar(calendar);

  try {
    const { error } = await supabase
      .from('calendars')
      .update({ deleted_at: null })
      .eq('id', calendar.id);
    if (error) {
      if (isNetworkError(error)) return offlineRestoreCalendar(calendar);
      return err(fromPostgrest(error));
    }
    await cachePut('calendars', calendar);
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e)) return offlineRestoreCalendar(calendar);
    return err(appError('data/query', 'data/query', e));
  }
}

/** その user にシフト用カレンダーが無ければ作る。既にあればそれを返す。 */
export async function ensureShiftCalendar(): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) {
    const cached = (await cacheGetAll('calendars')).find((c) => c.isShift);
    return cached ? ok(cached) : err(appError('data/offline', 'data/offline'));
  }

  try {
    const { data: existing, error: selectError } = await supabase
      .from('calendars')
      .select(COLUMNS)
      .is('deleted_at', null)
      .eq('is_shift', true)
      .limit(1)
      .maybeSingle();
    if (selectError) {
      if (isNetworkError(selectError)) {
        const cached = (await cacheGetAll('calendars')).find((c) => c.isShift);
        return cached ? ok(cached) : err(fromPostgrest(selectError));
      }
      return err(fromPostgrest(selectError));
    }
    if (existing) {
      const cal = toCalendar(existing as CalendarRow);
      await cachePut('calendars', cal);
      return ok(cal);
    }

    const { data, error } = await supabase
      .from('calendars')
      .insert({ name: 'シフト', color: SHIFT_CALENDAR_COLOR, source: 'local', is_shift: true })
      .select(COLUMNS)
      .single();
    if (error) return err(fromPostgrest(error));
    const created = toCalendar(data as CalendarRow);
    await cachePut('calendars', created);
    return ok(created);
  } catch (e) {
    if (isNetworkError(e)) {
      const cached = (await cacheGetAll('calendars')).find((c) => c.isShift);
      return cached ? ok(cached) : err(appError('data/query', 'data/query', e));
    }
    return err(appError('data/query', 'data/query', e));
  }
}
