// ローカル予定だけをGoogleへ反映。本文・トークンをログに出さない。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { refreshAccessToken } from '../_shared/google.ts';
import { googlePushBody, type GooglePushEvent } from '../_shared/google-push.ts';

const endpoint = 'https://www.googleapis.com/calendar/v3';
type Job = { id: string; user_id: string; event_id: string; connection_id: string; google_calendar_id: string;
  google_event_id: string; revision: number; lease_id: string; remote_present: boolean; remove: boolean;
  secret_cleanup: boolean; event: GooglePushEvent };

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method-not-allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
  if (!url || !key || !clientId || !clientSecret) return jsonResponse(req, { error: 'not-configured' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({}));
  const authorization = req.headers.get('Authorization') ?? '';
  // ゲートウェイで変換されるAuthorizationとは別の共有秘密を照合する。
  const cronSecret = Deno.env.get('GOOGLE_PUSH_CRON_SECRET') ?? '';
  const scheduled = body.scheduled === true && cronSecret !== '' && req.headers.get('X-Google-Push-Secret') === cronSecret;
  let userId: string | null = null;
  if (!scheduled) {
    const { data, error } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !data.user || data.user.is_anonymous) return jsonResponse(req, { error: 'not-authenticated' }, 401);
    userId = data.user.id;
    const { error: reconcileError } = await admin.rpc('reconcile_google_connections', { p_user_id: userId });
    if (reconcileError) throw new Error('reconcile-failed');
  }
  const tokenFor = async (connectionId: string, owner: string) => {
    const { data, error } = await admin.rpc('get_google_connection_token', { p_user_id: owner, p_connection_id: connectionId });
    if (error || typeof data !== 'string' || !data) throw new Error('reauth-needed');
    const token = await refreshAccessToken(data, clientId, clientSecret);
    if (!token.ok) throw new Error(token.reason);
    return token.accessToken;
  };
  if (body.action === 'choices' || body.action === 'target') {
    if (!userId) return jsonResponse(req, { error: 'not-authenticated' }, 401);
    const calendarId = typeof body.calendarId === 'string' ? body.calendarId : '';
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId : '';
    if (body.action === 'target' && body.connectionId === null) {
      const { error } = await admin.rpc('set_google_push_target', { p_user_id: userId, p_calendar_id: calendarId,
        p_connection_id: null, p_google_calendar_id: null });
      return jsonResponse(req, error ? { error: 'target-failed' } : { ok: true }, error ? 400 : 200);
    }
    const { data: allowed } = await admin.rpc('can_google_write', { p_user_id: userId });
    const { data: conn } = await admin.from('connections').select('id').eq('id', connectionId).eq('user_id', userId)
      .eq('provider', 'google').eq('status', 'active').eq('write_granted', true).is('deleted_at', null).maybeSingle();
    if (!allowed || !conn) return jsonResponse(req, { error: 'write-not-allowed' }, 403);
    const token = await tokenFor(connectionId, userId);
    const headers = { Authorization: `Bearer ${token}` };
    if (body.action === 'choices') {
      const choices: { id: string; name: string }[] = [];
      let page = '';
      do {
        const query = new URLSearchParams({ minAccessRole: 'writer', maxResults: '250' });
        if (page) query.set('pageToken', page);
        const response = await fetch(`${endpoint}/users/me/calendarList?${query}`, { headers, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('calendar-list-failed');
        const list = await response.json();
        for (const item of list.items ?? []) if (typeof item.id === 'string') choices.push({ id: item.id, name: item.summaryOverride ?? item.summary ?? item.id });
        page = list.nextPageToken ?? '';
      } while (page);
      return jsonResponse(req, { choices });
    }
    const googleCalendarId = typeof body.googleCalendarId === 'string' ? body.googleCalendarId : '';
    const response = await fetch(`${endpoint}/users/me/calendarList/${encodeURIComponent(googleCalendarId)}`, { headers, signal: AbortSignal.timeout(15000) });
    const entry = await response.json().catch(() => ({}));
    if (!response.ok || !['writer', 'owner'].includes(entry.accessRole)) return jsonResponse(req, { error: 'calendar-readonly' }, 403);
    const { error } = await admin.rpc('set_google_push_target', { p_user_id: userId, p_calendar_id: calendarId,
      p_connection_id: connectionId, p_google_calendar_id: googleCalendarId });
    return jsonResponse(req, error ? { error: 'target-failed' } : { ok: true }, error ? 400 : 200);
  }
  if (body.action === 'retry' && userId) {
    let retry = admin.from('event_google_links')
      .update({ next_attempt_at: new Date().toISOString() }).eq('user_id', userId).eq('state', 'error').is('lease_id', null);
    if (typeof body.eventId === 'string') retry = retry.eq('event_id', body.eventId);
    const { error: retryError } = await retry;
    if (retryError) throw new Error('retry-failed');
  }
  let succeeded = 0;
  let failed = 0;
  const processJob = async (job: Job) => {
    let state = 'error';
    let present = job.remote_present;
    let errorKey: string | null = null;
    let etag: string | null = null;
    try {
      // ロック後の非公開化・失効も反映直前に再確認する。
      const { data: latest, error: latestError } = await admin.from('events').select('*').eq('id', job.event_id).eq('user_id', job.user_id).single();
      if (latestError || !latest) throw new Error('event-unavailable');
      const remove = job.remove || latest.is_secret || latest.deleted_at !== null;
      if (!latest.is_secret) {
        const { data: allowed } = await admin.rpc('can_google_write', { p_user_id: job.user_id });
        if (!allowed) throw new Error('subscription-expired');
        await admin.rpc('reconcile_google_connections', { p_user_id: job.user_id });
        const { data: conn } = await admin.from('connections').select('id').eq('id', job.connection_id)
          .eq('user_id', job.user_id).eq('status', 'active').eq('write_granted', true).is('deleted_at', null).maybeSingle();
        if (!conn) throw new Error('connection-suspended');
      }
      const token = await tokenFor(job.connection_id, job.user_id);
      const base = `${endpoint}/calendars/${encodeURIComponent(job.google_calendar_id)}/events`;
      const eventUrl = `${base}/${encodeURIComponent(job.google_event_id)}`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const send = (address: string, method: string, payload?: unknown) => fetch(address, {
        method, headers, signal: AbortSignal.timeout(10000), ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      // Googleから取得した実在コピーのマーカーを照合して、無関係な予定を変更しない。
      const found = await send(eventUrl, 'GET');
      const remote = found.ok ? await found.json() : null;
      const missing = found.status === 404 || found.status === 410 || remote?.status === 'cancelled';
      if (!found.ok && !missing) throw new Error(`google-${found.status}`);
      if (!missing && remote?.extendedProperties?.private?.multiCalendarEventId !== job.event_id) throw new Error('event-identity-mismatch');
      if (remove) {
        if (!missing) {
          const deleted = await send(eventUrl, 'DELETE');
          if (!deleted.ok && ![404, 410].includes(deleted.status)) throw new Error(`google-${deleted.status}`);
        }
        state = 'deleted'; present = false;
      } else if (missing && (job.remote_present || remote?.status === 'cancelled' || found.status === 410)) {
        state = 'orphaned'; present = false;
      } else {
        // 取得後に停止・変更された反映先には、新しい本文を送らない。
        const { data: target, error: targetError } = await admin.from('google_push_targets').select('calendar_id')
          .eq('calendar_id', latest.calendar_id).eq('user_id', job.user_id).eq('enabled', true)
          .eq('connection_id', job.connection_id).eq('google_calendar_id', job.google_calendar_id).maybeSingle();
        if (targetError || !target) throw new Error('target-disabled');
        const payload = googlePushBody(latest as GooglePushEvent);
        if (!payload) throw new Error('invalid-event');
        const result = missing ? await send(base, 'POST', { ...payload, id: job.google_event_id })
          : await send(eventUrl, 'PATCH', payload);
        if (!result.ok) throw new Error(`google-${result.status}`);
        const updated = await result.json();
        etag = updated.etag ?? null; state = 'synced'; present = true;
      }
      succeeded++;
    } catch (e) {
      failed++;
      const reason = e instanceof Error ? e.message : '';
      errorKey = /^(google-\d{3}|subscription-expired|connection-suspended|reauth-needed|event-identity-mismatch|invalid-event|target-disabled)$/.test(reason) ? reason : 'push-failed';
    }
    const { error: finishError } = await admin.rpc('finish_google_push', { p_id: job.id, p_lease_id: job.lease_id,
      p_revision: job.revision, p_state: state, p_present: present, p_error: errorKey, p_etag: etag });
    if (finishError) throw new Error('finish-failed');
  };
  // 小さな排他単位を並列処理し、実行時間を区切って残件を次の定期実行へ渡す。
  const deadline = Date.now() + 60000;
  for (let batch = 0; batch < 20 && Date.now() < deadline; batch++) {
    const { data: jobs, error } = await admin.rpc('claim_google_push', { p_user_id: userId,
      p_event_id: userId && typeof body.eventId === 'string' ? body.eventId : null,
      p_calendar_id: userId && typeof body.calendarId === 'string' ? body.calendarId : null });
    if (error) throw new Error('queue-failed');
    if (!jobs?.length) break;
    await Promise.all((jobs as Job[]).map(processJob));
  }
  return jsonResponse(req, { succeeded, failed });
}
Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  try { return await handle(req); }
  catch { return jsonResponse(req, { error: 'push-failed' }, 500); }
});
