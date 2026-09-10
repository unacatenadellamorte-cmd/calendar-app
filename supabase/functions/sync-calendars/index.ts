// sync-calendars — 選択済み Google カレンダーの予定を Postgres へ一方向取り込み
// (Story 3.3、ARCHITECTURE-SPINE AD-2 / AD-3 / AD-4 / AD-7)。
//
//   ユーザーの「今すぐ取り込み」: JWT → auth.getUser() → そのユーザーの対象だけ
//   pg_cron の定期起動:            service_role JWT + { scheduled: true } → 全ユーザー
//
// Google API 呼び出し・refresh_token 復号はこの関数だけ。書き込みは service_role RPC。
// トークンはレスポンス・ログに出さない。1カレンダー / 1接続の失敗は他を止めない(AD-4)。
//
// 必要な関数シークレット: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は自動注入)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { fetchGoogleEvents, refreshAccessToken, type GoogleEventRaw } from '../_shared/google.ts';

// --- packages/core/src/google-events.ts と同じ規則。変更時は両方を直す。---
interface NormalizedEvent {
  external_id: string;
  title: string;
  note: string | null;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  event_date: string | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeGoogleEvent(raw: GoogleEventRaw): NormalizedEvent | null {
  if (!raw || raw.status === 'cancelled') return null;
  const externalId = typeof raw.id === 'string' ? raw.id : '';
  if (!externalId) return null;

  const title = (typeof raw.summary === 'string' ? raw.summary.trim() : '') || '(タイトルなし)';
  const noteRaw = typeof raw.description === 'string' ? raw.description.trim() : '';
  const note = noteRaw ? noteRaw.slice(0, 2000) : null;

  const startDate = raw.start?.date;
  if (typeof startDate === 'string' && DATE_ONLY.test(startDate)) {
    return {
      external_id: externalId,
      title: title.slice(0, 200),
      note,
      all_day: true,
      starts_at: null,
      ends_at: null,
      event_date: startDate,
    };
  }

  const startDateTime = raw.start?.dateTime;
  if (typeof startDateTime === 'string') {
    const startMs = Date.parse(startDateTime);
    if (Number.isNaN(startMs)) return null;
    const endSource = raw.end?.dateTime;
    const endMs = typeof endSource === 'string' ? Date.parse(endSource) : NaN;
    const safeEndMs = Number.isNaN(endMs) || endMs < startMs ? startMs : endMs;
    return {
      external_id: externalId,
      title: title.slice(0, 200),
      note,
      all_day: false,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(safeEndMs).toISOString(),
      event_date: null,
    };
  }

  return null;
}
// --- 複製ここまで ---

interface Target {
  user_id: string;
  connection_id: string;
  calendar_id: string;
  external_calendar_id: string;
  calendar_name: string;
}

/** JWT ペイロードの role クレーム(ゲートウェイが署名検証済み。ここでは復号のみ)。 */
function jwtRole(authHeader: string): string | null {
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4); // base64url のパディング補完
    const payload = JSON.parse(atob(b64)) as Record<string, unknown>;
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method-not-allowed' }, 405);

  const started = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    console.error('sync-calendars: missing env');
    return jsonResponse(req, { error: 'sync-failed' }, 500);
  }

  let scheduled = false;
  try {
    const body = await req.json();
    scheduled = body?.scheduled === true;
  } catch {
    // 本文なし = ユーザー起動扱い
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 経路を決める。
  let scopeUserId: string | null = null; // null = 全ユーザー(定期)
  if (scheduled && jwtRole(authHeader) === 'service_role') {
    scopeUserId = null;
  } else {
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return jsonResponse(req, { error: 'not-authenticated' }, 401);
    scopeUserId = userData.user.id;

    const { data: conn } = await admin
      .from('connections')
      .select('id')
      .eq('user_id', scopeUserId)
      .eq('provider', 'google')
      .is('deleted_at', null)
      .maybeSingle();
    if (!conn) return jsonResponse(req, { error: 'not-connected' }, 409);
  }

  // 取り込み対象。
  const { data: targetRows, error: targetError } = await admin.rpc('get_google_sync_targets', {
    p_user_id: scopeUserId,
  });
  if (targetError) {
    console.error('sync-calendars: get_google_sync_targets failed', targetError.message);
    return jsonResponse(req, { error: 'sync-failed' }, 500);
  }
  const targets = (targetRows ?? []) as Target[];

  // 時間窓: 今 - 60日 〜 今 + 400日。
  const now = Date.now();
  const windowMin = new Date(now - 60 * 86400_000).toISOString();
  const windowMax = new Date(now + 400 * 86400_000).toISOString();

  // 接続ごとにまとめる。
  const byConnection = new Map<string, Target[]>();
  for (const t of targets) {
    const list = byConnection.get(t.connection_id) ?? [];
    list.push(t);
    byConnection.set(t.connection_id, list);
  }

  const synced: { calendar: string; upserted: number; deleted: number }[] = [];
  const errors: { calendar: string; error: string }[] = [];

  for (const [connectionId, list] of byConnection) {
    const userId = list[0].user_id;

    const { data: refreshToken, error: rtError } = await admin.rpc('get_google_refresh_token', {
      p_user_id: userId,
    });
    if (rtError || typeof refreshToken !== 'string' || !refreshToken) {
      for (const t of list) {
        await admin.rpc('record_calendar_sync_error', {
          p_user_id: userId,
          p_connection_id: connectionId,
          p_calendar_id: t.calendar_id,
          p_external_calendar_id: t.external_calendar_id,
          p_error: 'reauth-needed',
        });
        errors.push({ calendar: t.calendar_name, error: 'reauth-needed' });
      }
      if (!scheduled && byConnection.size === 1) {
        return jsonResponse(req, { error: 'reauth-needed' }, 400);
      }
      continue;
    }

    const token = await refreshAccessToken(refreshToken, clientId, clientSecret);
    if (!token.ok) {
      const errKey = token.reason === 'reauth-needed' ? 'reauth-needed' : 'sync-failed';
      for (const t of list) {
        await admin.rpc('record_calendar_sync_error', {
          p_user_id: userId,
          p_connection_id: connectionId,
          p_calendar_id: t.calendar_id,
          p_external_calendar_id: t.external_calendar_id,
          p_error: errKey,
        });
        errors.push({ calendar: t.calendar_name, error: errKey });
      }
      if (!scheduled && byConnection.size === 1 && errKey === 'reauth-needed') {
        return jsonResponse(req, { error: 'reauth-needed' }, 400);
      }
      continue;
    }

    for (const t of list) {
      try {
        const raw = await fetchGoogleEvents(
          token.accessToken,
          t.external_calendar_id,
          windowMin,
          windowMax,
        );
        // 正規化 + external_id で重複排除(同一バッチ内の ON CONFLICT 二重更新を避ける)。
        const byExternalId = new Map<string, NormalizedEvent>();
        for (const item of raw) {
          const n = normalizeGoogleEvent(item);
          if (n) byExternalId.set(n.external_id, n);
        }
        const normalized = [...byExternalId.values()];
        const { data: applied, error: applyError } = await admin.rpc('apply_calendar_sync', {
          p_user_id: userId,
          p_connection_id: connectionId,
          p_calendar_id: t.calendar_id,
          p_external_calendar_id: t.external_calendar_id,
          p_events: normalized,
          p_window_min: windowMin,
          p_window_max: windowMax,
        });
        if (applyError) throw new Error(applyError.message);
        const result = (applied ?? { upserted: 0, deleted: 0 }) as {
          upserted: number;
          deleted: number;
        };
        synced.push({
          calendar: t.calendar_name,
          upserted: result.upserted,
          deleted: result.deleted,
        });
        console.log(
          `sync-calendars: ${t.calendar_name} fetched=${raw.length} upserted=${result.upserted} deleted=${result.deleted}`,
        );
      } catch (e) {
        const msg = (e as Error)?.message ?? 'sync-failed';
        await admin.rpc('record_calendar_sync_error', {
          p_user_id: userId,
          p_connection_id: connectionId,
          p_calendar_id: t.calendar_id,
          p_external_calendar_id: t.external_calendar_id,
          p_error: msg,
        });
        errors.push({ calendar: t.calendar_name, error: 'sync-failed' });
        console.warn(`sync-calendars: ${t.calendar_name} failed`, msg);
      }
    }
  }

  console.log(
    `sync-calendars: done scheduled=${scheduled} calendars=${synced.length} errors=${errors.length} elapsedMs=${Date.now() - started}`,
  );

  if (scheduled) {
    return jsonResponse(req, { ok: true, calendars: synced.length, errors: errors.length });
  }
  return jsonResponse(req, { synced, errors });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  try {
    return await handle(req);
  } catch (e) {
    console.error('sync-calendars: unhandled', (e as Error)?.message);
    return new Response(JSON.stringify({ error: 'sync-failed' }), {
      status: 500,
      headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
    });
  }
});
