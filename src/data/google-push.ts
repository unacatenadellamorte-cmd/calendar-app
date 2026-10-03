import { supabase } from './supabase';
import { invokeFn } from './edge';
import { appError, err, ok, type Result } from './result';

export interface PushTarget { calendarId: string; connectionId: string; googleCalendarId: string; enabled: boolean }
export interface PushStatus { eventId: string; state: string; lastError: string | null; lastPushedAt: string | null }
export async function getPushTarget(calendarId: string): Promise<Result<PushTarget | null>> {
  if (!supabase) return ok(null);
  try {
    const { data, error } = await supabase.from('google_push_targets').select('*').eq('calendar_id', calendarId).maybeSingle();
    if (error) return err(appError('data/query', 'data/query'));
    return ok(data ? { calendarId: data.calendar_id, connectionId: data.connection_id, googleCalendarId: data.google_calendar_id, enabled: data.enabled } : null);
  } catch { return err(appError('data/query', 'data/query')); }
}
export async function listPushStatus(eventId?: string, calendarId?: string): Promise<Result<PushStatus[]>> {
  if (!supabase) return ok([]);
  try {
    const statuses: PushStatus[] = [];
    for (let offset=0;;offset+=500) {
    let query = supabase.from('event_google_links').select('event_id,state,last_error,last_pushed_at,events!inner(calendar_id)');
    if (eventId) query = query.eq('event_id', eventId);
    if (calendarId) query = query.eq('events.calendar_id', calendarId);
    const { data, error } = await query.order('id').range(offset,offset+499);
    if (error) return err(appError('data/query', 'data/query'));
    statuses.push(...(data ?? []).map((row) => ({ eventId: row.event_id, state: row.state, lastError: row.last_error, lastPushedAt: row.last_pushed_at })));
    if ((data?.length ?? 0)<500) return ok(statuses);
    }
  } catch { return err(appError('data/query', 'data/query')); }
}
const errorKey = () => 'google-push/failed';
export const getWriteCalendars = (connectionId: string) => invokeFn<{ choices: { id: string; name: string }[] }>('push-events', { action: 'choices', connectionId }, errorKey, 'google-push/failed');
export const setPushTarget = (calendarId: string, connectionId: string | null, googleCalendarId: string | null) =>
  invokeFn<{ ok: true }>('push-events', { action: 'target', calendarId, connectionId, googleCalendarId }, errorKey, 'google-push/failed');
export const runGooglePush = (eventId?: string, calendarId?: string) => invokeFn<{ succeeded: number; failed: number }>('push-events', { action: 'retry', eventId, calendarId }, errorKey, 'google-push/failed');
