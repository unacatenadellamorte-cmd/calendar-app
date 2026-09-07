import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isPresetColor, SHIFT_CALENDAR_COLOR } from './calendar-colors';

/**
 * カレンダーの data-access レイヤ(ARCHITECTURE-SPINE AD-9 / AD-1)。
 * 真実源は Supabase Postgres。すべて Result を返し、throw しない。
 * snake_case(DB) ↔ camelCase(TS) 変換はこのファイルだけで行う。
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
  const { data, error } = await supabase
    .from('calendars')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('is_shift', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return err(fromPostgrest(error));
  return ok((data as CalendarRow[]).map(toCalendar));
}

export async function createCalendar(input: NewCalendarInput): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const nameError = validateName(input.name);
  if (nameError) return err(nameError);
  const colorError = validateColor(input.color);
  if (colorError) return err(colorError);

  // user_id は DB の default auth.uid() が入れる(マイグレーション参照)。
  const { data, error } = await supabase
    .from('calendars')
    .insert({ name: input.name.trim(), color: input.color, source: 'local' })
    .select(COLUMNS)
    .single();
  if (error) return err(fromPostgrest(error));
  return ok(toCalendar(data as CalendarRow));
}

export async function renameCalendar(id: string, name: string): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const nameError = validateName(name);
  if (nameError) return err(nameError);
  const { data, error } = await supabase
    .from('calendars')
    .update({ name: name.trim() })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) return err(fromPostgrest(error));
  return ok(toCalendar(data as CalendarRow));
}

export async function recolorCalendar(id: string, color: string): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const colorError = validateColor(color);
  if (colorError) return err(colorError);
  const { data, error } = await supabase
    .from('calendars')
    .update({ color })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) return err(fromPostgrest(error));
  return ok(toCalendar(data as CalendarRow));
}

export async function setCalendarVisible(
  id: string,
  isVisible: boolean,
): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const { data, error } = await supabase
    .from('calendars')
    .update({ is_visible: isVisible })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) return err(fromPostgrest(error));
  return ok(toCalendar(data as CalendarRow));
}

/** 論理削除。シフト用カレンダーは拒否する。 */
export async function deleteCalendar(
  calendar: Pick<Calendar, 'id' | 'isShift'>,
): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  if (calendar.isShift) {
    return err(appError('calendar/shift-undeletable', 'calendar/shift-undeletable'));
  }
  const { error } = await supabase
    .from('calendars')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', calendar.id);
  if (error) return err(fromPostgrest(error));
  return ok(undefined);
}

/** 論理削除を取り消す(Undo)。 */
export async function restoreCalendar(id: string): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  const { error } = await supabase.from('calendars').update({ deleted_at: null }).eq('id', id);
  if (error) return err(fromPostgrest(error));
  return ok(undefined);
}

/** その user にシフト用カレンダーが無ければ作る。既にあればそれを返す。 */
export async function ensureShiftCalendar(): Promise<Result<Calendar>> {
  if (!supabase) return err(UNAVAILABLE);
  const { data: existing, error: selectError } = await supabase
    .from('calendars')
    .select(COLUMNS)
    .is('deleted_at', null)
    .eq('is_shift', true)
    .limit(1)
    .maybeSingle();
  if (selectError) return err(fromPostgrest(selectError));
  if (existing) return ok(toCalendar(existing as CalendarRow));

  // user_id は DB の default auth.uid()。
  const { data, error } = await supabase
    .from('calendars')
    .insert({ name: 'シフト', color: SHIFT_CALENDAR_COLOR, source: 'local', is_shift: true })
    .select(COLUMNS)
    .single();
  if (error) return err(fromPostgrest(error));
  return ok(toCalendar(data as CalendarRow));
}
