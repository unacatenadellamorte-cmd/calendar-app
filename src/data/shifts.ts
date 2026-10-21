import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isNetworkError } from './net';
import { cachePut } from './cache';
import { addDays } from '@/lib/calendar-view';
import { localInputToUtcIso } from '@/lib/datetime';
import { COLUMNS as EVENT_COLUMNS, toEvent, type EventItem, type EventRow } from './events';
import type { ShiftTemplate } from './shift-templates';

/**
 * シフト「実体」の作成(AD-8: シフトは events のサブタイプ)。
 * テンプレの壁時計(HH:MM)+ 対象日 + ユーザー TZ から timestamptz を組み立てて
 * `events` に insert する。汎用の `createEvent` と違い、シフト属性列も書く。
 * オフライン対応は Story 4.2 では入れない(deferred)。
 */


function fromPostgrest(error: PostgrestError): AppError {
  return appError('data/query', 'data/query', error);
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
  operationIds?: string[],
): Promise<Result<EventItem[]>> {
  if (!supabase) return err(appError('data/unavailable', 'data/unavailable'));
  if (dates.length === 0) return ok([]);
  const ids = operationIds ?? dates.map(() => crypto.randomUUID());
  if (ids.length !== dates.length || new Set(ids).size !== ids.length) {
    return err(appError('data/query', 'data/query'));
  }
  if (!template.allDay && template.startLocal === template.endLocal) {
    return err(appError('shift-template/invalid-time', 'shift-template/invalid-time', { hint: '24時間は予定編集で翌日を指定' }));
  }

  const rows = dates.map((date, index) => {
    const { startsAt, endsAt } = template.allDay
      ? { startsAt: null, endsAt: null }
      : buildShiftTimes(date, template.startLocal, template.endLocal);
    return {
      id: ids[index]!,
      calendar_id: shiftCalendarId,
      title: template.name.trim(),
      all_day: template.allDay,
      starts_at: startsAt,
      ends_at: endsAt,
      event_date: template.allDay ? date : null,
      event_end_date: template.allDay ? addDays(date, 1) : null,
      note: null,
      // 追加時の色を複写し、予定ごとの後からの色変更を保持する。
      label_color: template.color,
      source: 'local' as const,
      break_minutes: template.allDay ? 0 : template.breakMinutes,
      hourly_wage: template.allDay ? 0 : template.hourlyWage,
      workplace_label: template.workplaceLabel?.trim() || null,
      shift_template_id: template.id,
    };
  });

  try {
    const { error } = await supabase
      .from('events')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) return err(fromPostgrest(error));
    const { data, error: readError } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .in('id', ids);
    if (readError) return err(fromPostgrest(readError));
    const byId = new Map((data as Record<string, unknown>[]).map((row) => [row.id, row]));
    if (ids.some((id) => !byId.has(id))) return err(appError('data/query', 'data/query'));
    const created = ids.map((id) => toEvent(byId.get(id)! as unknown as EventRow));
    for (const row of created) await cachePut('events', row);
    return ok(created);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline'));
    return err(appError('data/query', 'data/query', e));
  }
}
