import type { PostgrestError } from '@supabase/supabase-js';
import { byPriorityValue } from '@core';
import { supabase } from './supabase';
import { localAccountOwner } from './account-scope';
import { selectActive } from './soft-delete';
import { appError, err, ok, type AppError, type Result } from './result';
import { isPresetColor, SHIFT_CALENDAR_COLOR } from './calendar-colors';
import { isNetworkError, isOffline, type WriteOptions } from './net';
import { cacheDelete, cacheGetAll, cachePut, cacheReplace } from './cache';
import {
  newLocalId,
  offlineCreateCalendar,
  offlineDeleteCalendar,
  offlinePatchCalendar,
  offlineReorderCalendars,
  offlineRestoreCalendar,
} from './offline-write';

/**
 * カレンダーの data-access レイヤ(ARCHITECTURE-SPINE AD-9 / AD-1)。
 * 真実源は Supabase Postgres。すべて Result を返し、throw しない。
 * snake_case(DB) ↔ camelCase(TS) 変換はこのファイルだけで行う。
 * オフライン時: 読みは IndexedDB キャッシュ、書きは outbox キュー(offline-write.ts)。
 */

export type CalendarSource = 'local' | 'google' | 'device';

export interface Calendar {
  id: string;
  name: string;
  color: string;
  source: CalendarSource;
  isShift: boolean;
  isVisible: boolean;
  /** 表示優先度。小さいほど上位。user_id 内で一意(Story 2.1、AD-5)。 */
  priority: number;
  createdAt: string;
  updatedAt: string;
  /**
   * 取り込み元の接続 ID(source が google / device のとき)。ローカルは null。
   * 複数 Google アカウント(CAP-3)で、どのアカウントのカレンダーかを表示するのに使う。
   * オフライン作成・旧キャッシュでは欠けていることがある(undefined)。
   */
  externalConnectionId?: string | null;
}

export interface NewCalendarInput {
  name: string;
  color: string;
  /** 省略時も最初の送信前にクライアント発番し、再送まで保持する。 */
  id?: string;
}

interface CalendarRow {
  id: string;
  name: string;
  color: string;
  source: CalendarSource;
  is_shift: boolean;
  is_visible: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
  external_connection_id?: string | null;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
const COLUMNS =
  'id,name,color,source,is_shift,is_visible,priority,created_at,updated_at,external_connection_id';

function toCalendar(row: CalendarRow): Calendar {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    source: row.source,
    isShift: row.is_shift,
    isVisible: row.is_visible,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    externalConnectionId: row.external_connection_id ?? null,
  };
}

/** 優先度昇順、同順は作成順(オフライン fallback とローカル並べ直しで使う)。 */
export function sortCalendars(list: Calendar[]): Calendar[] {
  return [...list].sort(
    (a, b) => byPriorityValue(a, b) || a.createdAt.localeCompare(b.createdAt),
  );
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

export async function listCalendars(options: WriteOptions = {}): Promise<Result<Calendar[]>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline())
    return options.noOfflineFallback
      ? err(appError('data/offline', 'data/offline'))
      : ok(sortCalendars(await cacheGetAll('calendars')));
  try {
    const { data, error } = await selectActive('calendars', COLUMNS)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      if (isNetworkError(error))
        return options.noOfflineFallback
          ? err(appError('data/offline', 'data/offline', error))
          : ok(sortCalendars(await cacheGetAll('calendars')));
      return err(fromPostgrest(error));
    }
    const mapped = (data as unknown as CalendarRow[]).map(toCalendar);
    await cacheReplace('calendars', mapped);
    return ok(mapped);
  } catch (e) {
    if (isNetworkError(e))
      return options.noOfflineFallback
        ? err(appError('data/offline', 'data/offline', e))
        : ok(sortCalendars(await cacheGetAll('calendars')));
    return err(appError('data/query', 'data/query', e));
  }
}

export async function createCalendar(
  input: NewCalendarInput,
  options: WriteOptions = {},
): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const nameError = validateName(input.name);
  if (nameError) return err(nameError);
  const colorError = validateColor(input.color);
  if (colorError) return err(colorError);
  input = { ...input, id: input.id ?? newLocalId() };
  if (isOffline()) {
    if (options.noOfflineFallback) return err(appError('data/offline', 'data/offline'));
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
      if (isNetworkError(error))
        return options.noOfflineFallback
          ? err(appError('data/offline', 'data/offline', error))
          : offlineCreateCalendar(input.id ?? newLocalId(), input);
      if (options.noOfflineFallback && input.id && error.code === '23505') {
        const existing = await supabase
          .from('calendars')
          .select(COLUMNS)
          .eq('id', input.id)
          .eq('source', 'local')
          .eq('is_shift', false)
          .maybeSingle();
        if (existing.error)
          return err(
            isNetworkError(existing.error)
              ? appError('data/offline', 'data/offline', existing.error)
              : fromPostgrest(existing.error),
          );
        if (existing.data) return ok(toCalendar(existing.data as CalendarRow));
      }
      return err(fromPostgrest(error));
    }
    const created = toCalendar(data as CalendarRow);
    await cachePut('calendars', created);
    return ok(created);
  } catch (e) {
    if (isNetworkError(e))
      return options.noOfflineFallback
        ? err(appError('data/offline', 'data/offline', e))
        : offlineCreateCalendar(input.id ?? newLocalId(), input);
    return err(appError('data/query', 'data/query', e));
  }
}

async function patchCalendar(
  id: string,
  op: string,
  dbPatch: Record<string, unknown>,
  localPatch: Partial<Calendar>,
  payload: unknown,
  options: WriteOptions = {},
): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline())
    return options.noOfflineFallback
      ? err(appError('data/offline', 'data/offline'))
      : offlinePatchCalendar(id, op, localPatch, payload);
  try {
    const { data, error } = await supabase
      .from('calendars')
      .update(dbPatch)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) {
      if (isNetworkError(error))
        return options.noOfflineFallback
          ? err(appError('data/offline', 'data/offline', error))
          : offlinePatchCalendar(id, op, localPatch, payload);
      return err(fromPostgrest(error));
    }
    const updated = toCalendar(data as CalendarRow);
    await cachePut('calendars', updated);
    return ok(updated);
  } catch (e) {
    if (isNetworkError(e))
      return options.noOfflineFallback
        ? err(appError('data/offline', 'data/offline', e))
        : offlinePatchCalendar(id, op, localPatch, payload);
    return err(appError('data/query', 'data/query', e));
  }
}

export async function renameCalendar(
  id: string,
  name: string,
  options: WriteOptions = {},
): Promise<Result<Calendar>> {
  const nameError = validateName(name);
  if (nameError) return err(nameError);
  return patchCalendar(
    id,
    'rename',
    { name: name.trim() },
    { name: name.trim() },
    { name: name.trim() },
    options,
  );
}

export async function recolorCalendar(
  id: string,
  color: string,
  options: WriteOptions = {},
): Promise<Result<Calendar>> {
  const colorError = validateColor(color);
  if (colorError) return err(colorError);
  return patchCalendar(id, 'recolor', { color }, { color }, { color }, options);
}

export async function setCalendarVisible(
  id: string,
  isVisible: boolean,
  options: WriteOptions = {},
): Promise<Result<Calendar>> {
  return patchCalendar(
    id,
    'setVisible',
    { is_visible: isVisible },
    { isVisible },
    { isVisible },
    options,
  );
}

/** 論理削除。シフト用カレンダーは拒否する。 */
export async function deleteCalendar(
  calendar: Pick<Calendar, 'id' | 'isShift'>,
  options: WriteOptions = {},
): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  if (calendar.isShift) {
    return err(appError('calendar/shift-undeletable', 'calendar/shift-undeletable'));
  }
  if (isOffline())
    return options.noOfflineFallback
      ? err(appError('data/offline', 'data/offline'))
      : offlineDeleteCalendar(calendar.id);

  try {
    const { error } = await supabase
      .from('calendars')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', calendar.id);
    if (error) {
      if (isNetworkError(error))
        return options.noOfflineFallback
          ? err(appError('data/offline', 'data/offline', error))
          : offlineDeleteCalendar(calendar.id);
      return err(fromPostgrest(error));
    }
    await cacheDelete('calendars', calendar.id);
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e))
      return options.noOfflineFallback
        ? err(appError('data/offline', 'data/offline', e))
        : offlineDeleteCalendar(calendar.id);
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

/**
 * `orderedIds` の順に priority を採番し直す(Story 2.1、AD-5)。
 * 一意制約は RPC `reorder_calendars` 側で保証する。成功時は最新のカレンダー一覧を返す。
 */
export async function reorderCalendars(
  orderedIds: string[],
  options: WriteOptions = {},
): Promise<Result<Calendar[]>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline())
    return options.noOfflineFallback
      ? err(appError('data/offline', 'data/offline'))
      : offlineReorderCalendars(orderedIds);

  try {
    const { error } = await supabase.rpc('reorder_calendars', { ordered_ids: orderedIds });
    if (error) {
      if (isNetworkError(error))
        return options.noOfflineFallback
          ? err(appError('data/offline', 'data/offline', error))
          : offlineReorderCalendars(orderedIds);
      return err(fromPostgrest(error));
    }
    return listCalendars(options);
  } catch (e) {
    if (isNetworkError(e))
      return options.noOfflineFallback
        ? err(appError('data/offline', 'data/offline', e))
        : offlineReorderCalendars(orderedIds);
    return err(appError('data/query', 'data/query', e));
  }
}

/** その user にシフト用カレンダーが無ければ作る。既にあればそれを返す。 */
const shiftInFlight = new Map<string, Promise<Result<Calendar>>>();
export function ensureShiftCalendar(): Promise<Result<Calendar>> {
  const owner = localAccountOwner() ?? '未初期化';
  const pending = shiftInFlight.get(owner);
  if (pending) return pending;
  const run = runEnsureShiftCalendar().finally(() => {
    if (shiftInFlight.get(owner) === run) shiftInFlight.delete(owner);
  });
  shiftInFlight.set(owner, run);
  return run;
}

async function runEnsureShiftCalendar(): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  if (isOffline()) {
    const cached = (await cacheGetAll('calendars')).find((c) => c.isShift);
    return cached ? ok(cached) : err(appError('data/offline', 'data/offline'));
  }

  try {
    const { data: existing, error: selectError } = await selectActive('calendars', COLUMNS)
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
      const cal = toCalendar(existing as unknown as CalendarRow);
      await cachePut('calendars', cal);
      return ok(cal);
    }

    const { data, error } = await supabase
      .from('calendars')
      .insert({ name: 'シフト', color: SHIFT_CALENDAR_COLOR, source: 'local', is_shift: true })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') {
        const retry = await selectActive('calendars', COLUMNS)
          .eq('is_shift', true)
          .limit(1)
          .maybeSingle();
        if (!retry.error && retry.data) {
          const existingCalendar = toCalendar(retry.data as unknown as CalendarRow);
          await cachePut('calendars', existingCalendar);
          return ok(existingCalendar);
        }
      }
      return err(fromPostgrest(error));
    }
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
