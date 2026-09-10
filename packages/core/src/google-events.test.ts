import { describe, expect, it } from 'vitest';
import { deletedExternalIds, normalizeGoogleEvent } from './google-events';

describe('normalizeGoogleEvent', () => {
  it('cancelled は null(取り込まない)', () => {
    expect(
      normalizeGoogleEvent({ id: 'e1', status: 'cancelled', summary: 'x' }),
    ).toBeNull();
  });

  it('id が無ければ null', () => {
    expect(normalizeGoogleEvent({ summary: 'x', start: { date: '2026-09-15' } })).toBeNull();
  });

  it('start も end も無ければ null(スキップ)', () => {
    expect(normalizeGoogleEvent({ id: 'e1', summary: 'x' })).toBeNull();
  });

  it('start.dateTime が不正なら null', () => {
    expect(
      normalizeGoogleEvent({ id: 'e1', summary: 'x', start: { dateTime: 'いつか' } }),
    ).toBeNull();
  });

  it('終日: start.date を event_date に、時刻は null', () => {
    const n = normalizeGoogleEvent({ id: 'e1', summary: 'ゴミ', start: { date: '2026-09-15' } });
    expect(n).toMatchObject({
      externalId: 'e1',
      title: 'ゴミ',
      allDay: true,
      eventDate: '2026-09-15',
      startsAt: null,
      endsAt: null,
    });
  });

  it('時刻付き: starts/ends を UTC ISO で保存(タイムゾーン付き入力を UTC へ)', () => {
    const n = normalizeGoogleEvent({
      id: 'e2',
      summary: '会議',
      start: { dateTime: '2026-09-15T10:00:00+09:00' },
      end: { dateTime: '2026-09-15T11:00:00+09:00' },
    });
    expect(n).toMatchObject({
      externalId: 'e2',
      allDay: false,
      startsAt: '2026-09-15T01:00:00.000Z',
      endsAt: '2026-09-15T02:00:00.000Z',
      eventDate: null,
    });
  });

  it('end が無い時刻付きは開始に合わせる(starts_at <= ends_at を保証)', () => {
    const n = normalizeGoogleEvent({
      id: 'e3',
      summary: 'x',
      start: { dateTime: '2026-09-15T10:00:00Z' },
    });
    expect(n?.startsAt).toBe('2026-09-15T10:00:00.000Z');
    expect(n?.endsAt).toBe('2026-09-15T10:00:00.000Z');
  });

  it('end < start の異常データも開始に丸める', () => {
    const n = normalizeGoogleEvent({
      id: 'e4',
      summary: 'x',
      start: { dateTime: '2026-09-15T10:00:00Z' },
      end: { dateTime: '2026-09-15T09:00:00Z' },
    });
    expect(n?.endsAt).toBe(n?.startsAt);
  });

  it('summary 空はプレースホルダ、長すぎは 200 文字に切る', () => {
    expect(
      normalizeGoogleEvent({ id: 'e5', start: { date: '2026-09-15' } })?.title,
    ).toBe('(タイトルなし)');
    const long = 'あ'.repeat(300);
    expect(
      normalizeGoogleEvent({ id: 'e6', summary: long, start: { date: '2026-09-15' } })?.title,
    ).toHaveLength(200);
  });

  it('description を note に(空は null、長すぎは 2000 文字)', () => {
    expect(
      normalizeGoogleEvent({ id: 'e7', summary: 'x', description: '  メモ  ', start: { date: '2026-09-15' } })
        ?.note,
    ).toBe('メモ');
    expect(
      normalizeGoogleEvent({ id: 'e8', summary: 'x', start: { date: '2026-09-15' } })?.note,
    ).toBeNull();
    const long = 'x'.repeat(3000);
    expect(
      normalizeGoogleEvent({ id: 'e9', summary: 'x', description: long, start: { date: '2026-09-15' } })
        ?.note,
    ).toHaveLength(2000);
  });
});

describe('deletedExternalIds', () => {
  it('保存済みのうち今回取得に無いものを返す', () => {
    expect(deletedExternalIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['a']);
  });

  it('全部残っていれば空', () => {
    expect(deletedExternalIds(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('保存済みが空なら空', () => {
    expect(deletedExternalIds([], ['a'])).toEqual([]);
  });
});
