import { describe, expect, it } from 'vitest';
import { googlePushBody } from './google-push';

const baseEvent = {
  id: 'e1',
  title: '会議',
  all_day: false,
  event_date: null,
  starts_at: '2026-09-15T10:00:00Z',
  ends_at: '2026-09-15T11:00:00Z',
  note: null,
  location: null,
  source: 'local' as const,
  is_secret: false,
  deleted_at: null,
};

describe('googlePushBody', () => {
  it('source が local でなければ null', () => {
    expect(
      googlePushBody({ ...baseEvent, source: 'google' }),
    ).toBeNull();
  });

  it('is_secret が true なら null', () => {
    expect(
      googlePushBody({ ...baseEvent, is_secret: true }),
    ).toBeNull();
  });

  it('deleted_at が null でなければ null', () => {
    expect(
      googlePushBody({ ...baseEvent, deleted_at: '2026-09-15T00:00:00Z' }),
    ).toBeNull();
  });

  it('id が空なら null', () => {
    expect(
      googlePushBody({ ...baseEvent, id: '' }),
    ).toBeNull();
    expect(
      googlePushBody({ ...baseEvent, id: '   ' }),
    ).toBeNull();
  });

  it('title が空なら null', () => {
    expect(
      googlePushBody({ ...baseEvent, title: '' }),
    ).toBeNull();
    expect(
      googlePushBody({ ...baseEvent, title: '   ' }),
    ).toBeNull();
  });

  describe('終日', () => {
    const allDayBase = {
      ...baseEvent,
      all_day: true,
      starts_at: null,
      ends_at: null,
    };

    it('終日: 有効な YYYY-MM-DD を start.date と end.date(翌日) に', () => {
      const body = googlePushBody({
        ...allDayBase,
        event_date: '2026-09-15',
      });
      expect(body).toMatchObject({
        start: { date: '2026-09-15' },
        end: { date: '2026-09-16' },
      });
      expect(body?.start.dateTime).toBeNull();
      expect(body?.end.dateTime).toBeNull();
    });

    it('終日: 年末(2026-12-31)の翌日は 2027-01-01', () => {
      const body = googlePushBody({
        ...allDayBase,
        event_date: '2026-12-31',
      });
      expect(body?.end.date).toBe('2027-01-01');
    });

    it('終日: うるう年(2024-02-29)の翌日は 2024-03-01', () => {
      const body = googlePushBody({
        ...allDayBase,
        event_date: '2024-02-29',
      });
      expect(body?.end.date).toBe('2024-03-01');
    });

    it('終日: 不正な日付は null', () => {
      expect(googlePushBody({ ...allDayBase, event_date: '2026-02-29' })).toBeNull();
      expect(googlePushBody({ ...allDayBase, event_date: '2026-13-01' })).toBeNull();
      expect(googlePushBody({ ...allDayBase, event_date: 'invalid' })).toBeNull();
    });

    it('終日: event_date が null は null', () => {
      expect(googlePushBody({ ...allDayBase, event_date: null })).toBeNull();
    });
  });

  describe('時刻付き', () => {
    it('時刻付き: starts_at と ends_at が ISO UTC で返る', () => {
      const body = googlePushBody({
        ...baseEvent,
        starts_at: '2026-09-15T10:00:00Z',
        ends_at: '2026-09-15T11:00:00Z',
      });
      expect(body).toMatchObject({
        start: { dateTime: '2026-09-15T10:00:00.000Z' },
        end: { dateTime: '2026-09-15T11:00:00.000Z' },
      });
      expect(body?.start.date).toBeNull();
      expect(body?.end.date).toBeNull();
    });

    it('時刻付き: タイムゾーン付き入力を UTC に正規化する', () => {
      const body = googlePushBody({
        ...baseEvent,
        starts_at: '2026-09-15T10:00:00+09:00',
        ends_at: '2026-09-15T11:00:00+09:00',
      });
      expect(body?.start.dateTime).toBe('2026-09-15T01:00:00.000Z');
      expect(body?.end.dateTime).toBe('2026-09-15T02:00:00.000Z');
    });

    it('時刻付き: ends_at が starts_at より前なら null', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          starts_at: '2026-09-15T11:00:00Z',
          ends_at: '2026-09-15T10:00:00Z',
        }),
      ).toBeNull();
    });

    it('時刻付き: starts_at が不正なら null', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          starts_at: 'invalid',
          ends_at: '2026-09-15T11:00:00Z',
        }),
      ).toBeNull();
    });

    it('時刻付き: ends_at が不正なら null', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          starts_at: '2026-09-15T10:00:00Z',
          ends_at: 'invalid',
        }),
      ).toBeNull();
    });

    it('時刻付き: starts_at が null は null', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          starts_at: null,
          ends_at: '2026-09-15T11:00:00Z',
        }),
      ).toBeNull();
    });

    it('時刻付き: ends_at が null は null', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          starts_at: '2026-09-15T10:00:00Z',
          ends_at: null,
        }),
      ).toBeNull();
    });
  });

  describe('テキストフィールド', () => {
    it('summary は title', () => {
      const body = googlePushBody({
        ...baseEvent,
        title: '打ち合わせ',
      });
      expect(body?.summary).toBe('打ち合わせ');
    });

    it('description は note(null なら空文字)', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          note: 'メモ',
        })?.description,
      ).toBe('メモ');
      expect(
        googlePushBody({
          ...baseEvent,
          note: null,
        })?.description,
      ).toBe('');
    });

    it('location は location(null なら空文字、option も処理)', () => {
      expect(
        googlePushBody({
          ...baseEvent,
          location: '会議室A',
        })?.location,
      ).toBe('会議室A');
      expect(
        googlePushBody({
          ...baseEvent,
          location: null,
        })?.location,
      ).toBe('');
      expect(
        googlePushBody({
          ...baseEvent,
          // location が undefined の場合(option)
        })?.location,
      ).toBe('');
    });

    it('余計なフィールドは入らない(summary/description/location/start/end/extendedProperties だけ)', () => {
      const body = googlePushBody(baseEvent)!;
      const keys = Object.keys(body).sort();
      expect(keys).toEqual(['description', 'end', 'extendedProperties', 'location', 'start', 'summary']);
    });
  });

  it('extendedProperties に multiCalendarEventId(id) を保存', () => {
    const body = googlePushBody({
      ...baseEvent,
      id: 'evt-12345',
    });
    expect(body?.extendedProperties).toEqual({
      private: { multiCalendarEventId: 'evt-12345' },
    });
  });
});
