import { describe, expect, it } from 'vitest';
import {
  GOOGLE_CALENDAR_SCOPES,
  buildGoogleAuthUrl,
  parseGoogleTokenResponse,
  primaryEmailFromCalendarList,
} from './google-oauth';

describe('buildGoogleAuthUrl', () => {
  const base = {
    clientId: 'cid.apps.googleusercontent.com',
    redirectUri: 'http://localhost:5173/connections/google/callback',
    state: 'abc123',
  };

  it('同意画面のエンドポイントに必要なパラメータを載せる', () => {
    const url = new URL(buildGoogleAuthUrl(base));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = url.searchParams;
    expect(q.get('client_id')).toBe(base.clientId);
    expect(q.get('redirect_uri')).toBe(base.redirectUri);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('include_granted_scopes')).toBe('true');
    expect(q.get('state')).toBe('abc123');
  });

  it('スコープはスペース区切りで両方入る(既定 = カレンダー読み取り2つ)', () => {
    const q = new URL(buildGoogleAuthUrl(base)).searchParams;
    expect(q.get('scope')).toBe(GOOGLE_CALENDAR_SCOPES.join(' '));
    expect(GOOGLE_CALENDAR_SCOPES).toHaveLength(2);
    // 全スコープが .readonly(書き込みスコープを要求しない)
    for (const s of GOOGLE_CALENDAR_SCOPES) expect(s.endsWith('.readonly')).toBe(true);
  });

  it('scopes を明示指定できる', () => {
    const q = new URL(
      buildGoogleAuthUrl({ ...base, scopes: ['https://example.test/a'] }),
    ).searchParams;
    expect(q.get('scope')).toBe('https://example.test/a');
  });
});

describe('parseGoogleTokenResponse', () => {
  it('正常応答から refresh / access を取り出す', () => {
    const r = parseGoogleTokenResponse({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3599,
      token_type: 'Bearer',
    });
    expect(r).toEqual({ ok: true, refreshToken: 'rt', accessToken: 'at', expiresInSec: 3599 });
  });

  it('expires_in が無くても 0 で通す', () => {
    const r = parseGoogleTokenResponse({ access_token: 'at', refresh_token: 'rt' });
    expect(r).toMatchObject({ ok: true, expiresInSec: 0 });
  });

  it('refresh_token 欠落は no-refresh-token', () => {
    expect(parseGoogleTokenResponse({ access_token: 'at' })).toEqual({
      ok: false,
      reason: 'no-refresh-token',
    });
    expect(parseGoogleTokenResponse({ access_token: 'at', refresh_token: '' })).toEqual({
      ok: false,
      reason: 'no-refresh-token',
    });
  });

  it('Google エラー応答 / access_token 欠落 / 非オブジェクトは exchange-failed', () => {
    expect(parseGoogleTokenResponse({ error: 'invalid_grant' })).toEqual({
      ok: false,
      reason: 'exchange-failed',
    });
    expect(parseGoogleTokenResponse({ refresh_token: 'rt' })).toEqual({
      ok: false,
      reason: 'exchange-failed',
    });
    expect(parseGoogleTokenResponse(null)).toEqual({ ok: false, reason: 'exchange-failed' });
    expect(parseGoogleTokenResponse('nope')).toEqual({ ok: false, reason: 'exchange-failed' });
  });
});

describe('primaryEmailFromCalendarList', () => {
  it('primary:true の行の id を返す', () => {
    const email = primaryEmailFromCalendarList({
      items: [
        { id: 'team@group.calendar.google.com', primary: false },
        { id: 'me@gmail.com', primary: true },
      ],
    });
    expect(email).toBe('me@gmail.com');
  });

  it('primary が無ければ null', () => {
    expect(primaryEmailFromCalendarList({ items: [{ id: 'x', primary: false }] })).toBeNull();
    expect(primaryEmailFromCalendarList({ items: [] })).toBeNull();
    expect(primaryEmailFromCalendarList({})).toBeNull();
    expect(primaryEmailFromCalendarList(null)).toBeNull();
  });

  it('primary:true でも id が文字列でなければ null', () => {
    expect(primaryEmailFromCalendarList({ items: [{ primary: true }] })).toBeNull();
  });
});
