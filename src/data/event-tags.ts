import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type AppError, type Result } from './result';

export interface EventTag {
  id: string;
  name: string;
  color: string;
  startLocal: string;
  endLocal: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewEventTagInput {
  name: string;
  color: string;
  startLocal: string;
  endLocal: string;
}

export type EventTagPatch = Partial<NewEventTagInput>;

interface EventTagRow {
  id: string;
  user_id?: string;
  name: string;
  color: string;
  start_local: string;
  end_local: string;
  created_at: string;
  updated_at: string;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
const COLUMNS = 'id,name,color,start_local,end_local,created_at,updated_at';
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
}

function toEventTag(row: EventTagRow): EventTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    startLocal: row.start_local,
    endLocal: row.end_local,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function minutesOf(value: string): number | null {
  if (!HHMM.test(value)) return null;
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function validateFields(input: NewEventTagInput): AppError | null {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) {
    return appError('event-tag/invalid-name', 'event-tag/invalid-name');
  }
  if (!HEX6.test(input.color)) {
    return appError('event-tag/invalid-color', 'event-tag/invalid-color');
  }
  const start = minutesOf(input.startLocal);
  const end = minutesOf(input.endLocal);
  if (start === null || end === null || start === end) {
    return appError('event-tag/invalid-time', 'event-tag/invalid-time');
  }
  return null;
}

export function validateEventTagInput(input: NewEventTagInput): AppError | null {
  return validateFields(input);
}

export function validateEventTagPatch(
  current: EventTag,
  patch: EventTagPatch,
): AppError | null {
  return validateFields({
    name: patch.name ?? current.name,
    color: patch.color ?? current.color,
    startLocal: patch.startLocal ?? current.startLocal,
    endLocal: patch.endLocal ?? current.endLocal,
  });
}

function rowFromInput(input: NewEventTagInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    color: input.color,
    start_local: input.startLocal,
    end_local: input.endLocal,
  };
}

export async function listEventTags(): Promise<Result<EventTag[]>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await selectActive('event_tags', COLUMNS).order('created_at', {
      ascending: true,
    });
    if (error) return err(fromPostgrest(error));
    return ok((data as unknown as EventTagRow[]).map(toEventTag));
  } catch (cause) {
    return err(appError('data/query', 'data/query', cause));
  }
}

export async function createEventTag(input: NewEventTagInput): Promise<Result<EventTag>> {
  if (!supabase) return err(UNAVAILABLE);
  const invalid = validateFields(input);
  if (invalid) return err(invalid);
  try {
    const { data, error } = await supabase
      .from('event_tags')
      .insert(rowFromInput(input))
      .select(COLUMNS)
      .single();
    if (error) return err(fromPostgrest(error));
    return ok(toEventTag(data as EventTagRow));
  } catch (cause) {
    return err(appError('data/query', 'data/query', cause));
  }
}

export async function updateEventTag(
  current: EventTag,
  patch: EventTagPatch,
): Promise<Result<EventTag>> {
  if (!supabase) return err(UNAVAILABLE);
  const invalid = validateEventTagPatch(current, patch);
  if (invalid) return err(invalid);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.startLocal !== undefined) row.start_local = patch.startLocal;
  if (patch.endLocal !== undefined) row.end_local = patch.endLocal;
  try {
    const { data, error } = await supabase
      .from('event_tags')
      .update(row)
      .eq('id', current.id)
      .select(COLUMNS)
      .single();
    if (error) return err(fromPostgrest(error));
    return ok(toEventTag(data as EventTagRow));
  } catch (cause) {
    return err(appError('data/query', 'data/query', cause));
  }
}

export async function deleteEventTag(id: string): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { error } = await supabase
      .from('event_tags')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return err(fromPostgrest(error));
    return ok(undefined);
  } catch (cause) {
    return err(appError('data/query', 'data/query', cause));
  }
}
