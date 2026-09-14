import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isNetworkError } from './net';
import { cachePut } from './cache';
import { addDays } from '@/lib/calendar-view';
import { localInputToUtcIso } from '@/lib/datetime';
import type { EventItem } from './events';
import type { ShiftTemplate } from './shift-templates';

/**
 * シフト「実体」の作成(AD-8: シフトは events のサブタイプ)。
 * テンプレの壁時計(HH:MM)+ 対象日 + ユーザー TZ から timestamptz を組み立てて
 * `events` に insert する。汎用の `createEvent` と違い、シフト属性列も書く。
 * オフライン対応は Story 4.2 では入れない(deferred)。
 */

const COLUMNS =
  'id,calendar_id,title,all_day,starts_at,ends_at,event_date,note,source,break_minutes,hourly_wage,workplace_label,shift_template_id,created_at,updated_at';

function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
}

function toEvent(row: Record<string, unknown>): EventItem {
  return {
    id: row.id as string,
    calendarId: row.calendar_id as string,
    title: row.title as string,
    allDay: row.all_day as boolean,
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    eventDate: (row.event_date as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    source: row.source as EventItem['source'],
    breakMinutes: (row.break_minutes as number | null) ?? null,
    hourlyWage: (row.hourly_wage as number | null) ?? null,
    workplaceLabel: (row.workplace_label as string | null) ?? null,
    shiftTemplateId: (row.shift_template_id as string | null) ?? null,
    // 新規作成直後の行なので常に未設定(リマインダーは setEventReminder で後から設定する)。
    reminderMinutes: null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 壁時計の開始・終了(HH:MM)を、対象暦日 `date` の UTC ISO に変換する。
 * `endLocal <= startLocal` なら終了は翌日(`starts_at <= ends_at` を保証)。
 */
export function buildShiftTimes(
  date: string,
  startLocal: string,
  endLocal: string,
): { startsAt: string; endsAt: string } {
  const endDate = endLocal <= startLocal ? addDays(date, 1) : date;
  return {
    startsAt: localInputToUtcIso(`${date}T${startLocal}`),
    endsAt: localInputToUtcIso(`${endDate}T${endLocal}`),
  };
}

/** テンプレから連続 `dates` 日ぶんのシフトを一括作成する。 */
export async function createShifts(
  shiftCalendarId: string,
  template: ShiftTemplate,
  dates: string[],
): Promise<Result<EventItem[]>> {
  if (!supabase) return err(appError('data/unavailable', 'data/unavailable'));
  if (dates.length === 0) return ok([]);

  const rows = dates.map((date) => {
    const { startsAt, endsAt } = buildShiftTimes(date, template.startLocal, template.endLocal);
    return {
      calendar_id: shiftCalendarId,
      title: template.name.trim(),
      all_day: false,
      starts_at: startsAt,
      ends_at: endsAt,
      event_date: null,
      note: null,
      source: 'local' as const,
      break_minutes: template.breakMinutes,
      hourly_wage: template.hourlyWage,
      workplace_label: template.workplaceLabel?.trim() || null,
      shift_template_id: template.id,
    };
  });

  try {
    const { data, error } = await supabase.from('events').insert(rows).select(COLUMNS);
    if (error) return err(fromPostgrest(error));
    const created = (data as Record<string, unknown>[]).map(toEvent);
    for (const row of created) await cachePut('events', row);
    return ok(created);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline'));
    return err(appError('data/query', 'data/query', e));
  }
}
