import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isPresetColor } from './calendar-colors';
import { isNetworkError } from './net';

/**
 * お気に入りシフトのテンプレの data-access レイヤ(AD-9 / AD-8)。
 * 真実源は Supabase Postgres。すべて Result を返し throw しない。
 * snake_case(DB) ↔ camelCase(TS) 変換はこのファイルだけ。
 * オフライン対応(キャッシュ / outbox)は Story 4.1 では入れない(deferred)。
 */

export interface ShiftTemplate {
  id: string;
  name: string;
  /** 壁時計の開始 "HH:MM"。 */
  startLocal: string;
  /** 壁時計の終了 "HH:MM"。開始より前なら日をまたぐ。 */
  endLocal: string;
  breakMinutes: number;
  hourlyWage: number;
  workplaceLabel: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewShiftTemplateInput {
  name: string;
  startLocal: string;
  endLocal: string;
  breakMinutes: number;
  hourlyWage: number;
  workplaceLabel?: string | null;
  color: string;
}

export type ShiftTemplatePatch = Partial<NewShiftTemplateInput>;

interface ShiftTemplateRow {
  id: string;
  name: string;
  start_local: string;
  end_local: string;
  break_minutes: number;
  hourly_wage: number;
  workplace_label: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
const COLUMNS =
  'id,name,start_local,end_local,break_minutes,hourly_wage,workplace_label,color,created_at,updated_at';

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function toTemplate(row: ShiftTemplateRow): ShiftTemplate {
  return {
    id: row.id,
    name: row.name,
    startLocal: row.start_local,
    endLocal: row.end_local,
    breakMinutes: row.break_minutes,
    hourlyWage: row.hourly_wage,
    workplaceLabel: row.workplace_label,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
}

/** "HH:MM" をローカル午前0時からの分に。形が不正なら null。 */
function minutesOf(hhmm: string): number | null {
  if (!HHMM.test(hhmm)) return null;
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** テンプレの実働分(日またぎを通算)。start/end が不正 or 同値なら null。 */
export function templateWorkedMinutes(startLocal: string, endLocal: string): number | null {
  const s = minutesOf(startLocal);
  const e = minutesOf(endLocal);
  if (s === null || e === null) return null;
  const span = (e - s + 1440) % 1440;
  return span === 0 ? null : span;
}

/** 入力(全項目)の妥当性。問題なければ null。 */
export function validateShiftTemplateInput(input: NewShiftTemplateInput): AppError | null {
  return validateFields(input);
}

/** patch に含まれる項目だけを、最終形に対して検証する。 */
export function validateShiftTemplatePatch(
  current: ShiftTemplate,
  patch: ShiftTemplatePatch,
): AppError | null {
  return validateFields({
    name: patch.name ?? current.name,
    startLocal: patch.startLocal ?? current.startLocal,
    endLocal: patch.endLocal ?? current.endLocal,
    breakMinutes: patch.breakMinutes ?? current.breakMinutes,
    hourlyWage: patch.hourlyWage ?? current.hourlyWage,
    workplaceLabel:
      patch.workplaceLabel !== undefined ? patch.workplaceLabel : current.workplaceLabel,
    color: patch.color ?? current.color,
  });
}

function validateFields(v: NewShiftTemplateInput): AppError | null {
  const name = v.name.trim();
  if (name.length < 1 || name.length > 100) {
    return appError('shift-template/invalid-name', 'shift-template/invalid-name');
  }
  const worked = templateWorkedMinutes(v.startLocal, v.endLocal);
  if (worked === null) {
    return appError('shift-template/invalid-time', 'shift-template/invalid-time');
  }
  if (!Number.isInteger(v.breakMinutes) || v.breakMinutes < 0 || v.breakMinutes >= worked) {
    return appError('shift-template/invalid-break', 'shift-template/invalid-break');
  }
  if (!Number.isInteger(v.hourlyWage) || v.hourlyWage < 0) {
    return appError('shift-template/invalid-wage', 'shift-template/invalid-wage');
  }
  if ((v.workplaceLabel ?? '').length > 100) {
    return appError('shift-template/invalid-workplace', 'shift-template/invalid-workplace');
  }
  if (!isPresetColor(v.color)) {
    return appError('shift-template/invalid-color', 'shift-template/invalid-color');
  }
  return null;
}

function rowFromInput(input: NewShiftTemplateInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    start_local: input.startLocal,
    end_local: input.endLocal,
    break_minutes: input.breakMinutes,
    hourly_wage: input.hourlyWage,
    workplace_label: input.workplaceLabel?.trim() || null,
    color: input.color,
  };
}

export async function listShiftTemplates(): Promise<Result<ShiftTemplate[]>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await supabase
      .from('shift_templates')
      .select(COLUMNS)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) return err(fromPostgrest(error));
    return ok((data as ShiftTemplateRow[]).map(toTemplate));
  } catch (e) {
    // オフライン対応(キャッシュ)は未実装(deferred)。せめて文言はオフライン寄りにする。
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline'));
    return err(appError('data/query', 'data/query', e));
  }
}

export async function createShiftTemplate(
  input: NewShiftTemplateInput,
): Promise<Result<ShiftTemplate>> {
  if (!supabase) return err(UNAVAILABLE);
  const invalid = validateShiftTemplateInput(input);
  if (invalid) return err(invalid);
  try {
    const { data, error } = await supabase
      .from('shift_templates')
      .insert(rowFromInput(input))
      .select(COLUMNS)
      .single();
    if (error) return err(fromPostgrest(error));
    return ok(toTemplate(data as ShiftTemplateRow));
  } catch (e) {
    return err(appError('data/query', 'data/query', e));
  }
}

export async function updateShiftTemplate(
  current: ShiftTemplate,
  patch: ShiftTemplatePatch,
): Promise<Result<ShiftTemplate>> {
  if (!supabase) return err(UNAVAILABLE);
  const invalid = validateShiftTemplatePatch(current, patch);
  if (invalid) return err(invalid);

  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.startLocal !== undefined) row.start_local = patch.startLocal;
  if (patch.endLocal !== undefined) row.end_local = patch.endLocal;
  if (patch.breakMinutes !== undefined) row.break_minutes = patch.breakMinutes;
  if (patch.hourlyWage !== undefined) row.hourly_wage = patch.hourlyWage;
  if (patch.workplaceLabel !== undefined) {
    row.workplace_label = patch.workplaceLabel?.trim() || null;
  }
  if (patch.color !== undefined) row.color = patch.color;

  try {
    const { data, error } = await supabase
      .from('shift_templates')
      .update(row)
      .eq('id', current.id)
      .select(COLUMNS)
      .single();
    if (error) return err(fromPostgrest(error));
    return ok(toTemplate(data as ShiftTemplateRow));
  } catch (e) {
    return err(appError('data/query', 'data/query', e));
  }
}

export async function deleteShiftTemplate(id: string): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { error } = await supabase
      .from('shift_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return err(fromPostgrest(error));
    return ok(undefined);
  } catch (e) {
    return err(appError('data/query', 'data/query', e));
  }
}

export async function restoreShiftTemplate(id: string): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { error } = await supabase
      .from('shift_templates')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) return err(fromPostgrest(error));
    return ok(undefined);
  } catch (e) {
    return err(appError('data/query', 'data/query', e));
  }
}
