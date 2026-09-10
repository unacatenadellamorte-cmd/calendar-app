// Google Calendar API v3 の読み取り(Story 3.2 / 3.3、ARCHITECTURE-SPINE AD-2 / AD-3)。
// refresh_token → access_token の交換と Google への読み取りリクエストはここに集約する。
// 書き込みスコープは要求しない。アプリから Google へ書き戻す関数はコードベースに置かない。

import type { GoogleEventRaw } from './google-events.ts';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'reauth-needed' | 'failed' };

/** refresh_token から access_token を取得する。invalid_grant は再認可が必要。 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<AccessTokenResult> {
  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (json && typeof json.access_token === 'string') {
    return { ok: true, accessToken: json.access_token };
  }
  if (json && json.error === 'invalid_grant') {
    return { ok: false, reason: 'reauth-needed' };
  }
  return { ok: false, reason: 'failed' };
}

export interface GoogleCalendarListEntry {
  externalCalendarId: string;
  summary: string;
  backgroundColor: string | null;
}

/** そのアカウントのカレンダー一覧(所有 + 書き込み可のものに限定)。 */
export async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const entries: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    url.searchParams.set('minAccessRole', 'reader');
    url.searchParams.set('maxResults', '250');
    url.searchParams.set('showHidden', 'false');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`calendarList ${res.status}`);
    const body = await res.json();
    for (const item of body.items ?? []) {
      if (typeof item?.id !== 'string') continue;
      entries.push({
        externalCalendarId: item.id,
        summary: typeof item.summaryOverride === 'string' ? item.summaryOverride : String(item.summary ?? ''),
        backgroundColor: normalizeHexColor(item.backgroundColor),
      });
    }
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined;
  } while (pageToken);
  return entries;
}

/**
 * 1カレンダー分の予定を時間窓で取得する(Story 3.3)。
 * `singleEvents=true` で繰り返しは展開済みインスタンス、`showDeleted=false`。
 * ページング対応。読み取りのみ。`!res.ok` は throw(呼び出し側が catch してカレンダー単位で記録)。
 */
export async function fetchGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleEventRaw[]> {
  const events: GoogleEventRaw[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'false');
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('timeMin', timeMinIso);
    url.searchParams.set('timeMax', timeMaxIso);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`events.list ${res.status}`);
    const body = await res.json();
    for (const item of body.items ?? []) {
      if (item && typeof item === 'object') events.push(item as GoogleEventRaw);
    }
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined;
  } while (pageToken);
  return events;
}

// src/data/calendar-colors.ts の normalizeHexColor と同じパース規則(ローカルに Deno が
// 無く import できないため複製)。ただし失敗時はこちらは null を返す(カタログに null 格納、
// 実カレンダー生成時に SQL 側で既定色へ coalesce する)。変更時は両方を直す。
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
  return null;
}
