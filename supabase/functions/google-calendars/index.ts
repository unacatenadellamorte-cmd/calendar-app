// google-calendars — 取り込むカレンダーの候補取得と選択(Story 3.2)。
//
//   action: 'refresh' → Google の calendarList を取得して connection_calendars を更新、候補を返す
//   action: 'set'     → { externalCalendarId, selected } で候補をオン/オフ
//                       (オンで public.calendars(source=google)行を生成)
//
// Google API 呼び出し・refresh_token 復号はこの関数だけ。トークンはクライアントに返さない。

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { fetchCalendarList, refreshAccessToken } from '../_shared/google.ts';

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method-not-allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    console.error('google-calendars: missing env');
    return jsonResponse(req, { error: 'calendars-failed' }, 500);
  }

  // 1) ユーザー特定。
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(req, { error: 'not-authenticated' }, 401);
  const userId = userData.user.id;

  // 2) 本文。
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* noop */
  }
  const action = body.action;
  if (action !== 'refresh' && action !== 'set') {
    return jsonResponse(req, { error: 'calendars-failed' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) 接続を引く。
  const { data: conn } = await admin
    .from('connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .is('deleted_at', null)
    .maybeSingle();
  if (!conn) return jsonResponse(req, { error: 'not-connected' }, 409);
  const connectionId = conn.id as string;

  if (action === 'set') {
    const externalCalendarId = typeof body.externalCalendarId === 'string' ? body.externalCalendarId : '';
    const selected = body.selected === true;
    if (!externalCalendarId) return jsonResponse(req, { error: 'calendars-failed' }, 400);
    const { error } = await admin.rpc('set_google_calendar_selection', {
      p_user_id: userId,
      p_connection_id: connectionId,
      p_external_calendar_id: externalCalendarId,
      p_selected: selected,
    });
    if (error) {
      console.error('google-calendars: set failed', error.message);
      return jsonResponse(req, { error: 'calendars-failed' }, 500);
    }
    return jsonResponse(req, { ok: true });
  }

  // action === 'refresh'
  const { data: refreshToken, error: rtError } = await admin.rpc('get_google_refresh_token', {
    p_user_id: userId,
  });
  if (rtError || typeof refreshToken !== 'string' || !refreshToken) {
    return jsonResponse(req, { error: 'reauth-needed' }, 400);
  }

  const token = await refreshAccessToken(refreshToken, clientId, clientSecret);
  if (!token.ok) {
    return jsonResponse(req, { error: token.reason === 'reauth-needed' ? 'reauth-needed' : 'calendars-failed' }, 400);
  }

  let entries;
  try {
    entries = await fetchCalendarList(token.accessToken);
  } catch (e) {
    console.warn('google-calendars: calendarList failed', (e as Error)?.message);
    return jsonResponse(req, { error: 'calendars-failed' }, 502);
  }

  const { error: upsertError } = await admin.rpc('upsert_connection_calendars', {
    p_user_id: userId,
    p_connection_id: connectionId,
    p_items: entries.map((e) => ({
      external_calendar_id: e.externalCalendarId,
      summary: e.summary,
      background_color: e.backgroundColor,
    })),
  });
  if (upsertError) {
    console.error('google-calendars: upsert failed', upsertError.message);
    return jsonResponse(req, { error: 'calendars-failed' }, 500);
  }

  console.log(`google-calendars: refresh ok user=${userId} count=${entries.length}`);
  return jsonResponse(req, { count: entries.length });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  try {
    return await handle(req);
  } catch (e) {
    console.error('google-calendars: unhandled', (e as Error)?.message);
    return new Response(JSON.stringify({ error: 'calendars-failed' }), {
      status: 500,
      headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
    });
  }
});
