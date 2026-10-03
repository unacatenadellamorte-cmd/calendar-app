/**
 * Google Calendar API へのプッシュ用イベント(multiCalendarEvent → Calendar API の形へ変換)。
 * 純粋な変換ロジック。秘匿情報・削除済みは除外し、必要最小限の項目だけを返す。
 * 依存なし。
 */

export interface GooglePushEvent {
  id: string;
  title: string;
  all_day: boolean;
  event_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
  location?: string | null;
  source: string;
  is_secret: boolean;
  deleted_at: string | null;
}

export interface GooglePushBody {
  summary: string;
  description: string;
  location: string;
  start: { date: string | null; dateTime: string | null };
  end: { date: string | null; dateTime: string | null };
  extendedProperties: { private: { multiCalendarEventId: string } };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 有効な YYYY-MM-DD かどうか(実在する日付かどうか)。
 * グレゴリオ暦の規則に従う。
 */
function isValidDate(dateStr: string): boolean {
  if (!DATE_ONLY.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === dateStr && dateStr < '9999-12-31';
}

/**
 * YYYY-MM-DD の翌日を返す(排他的終了用)。
 */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

/**
 * multiCalendarEvent をGoogle Calendar API のボディに変換する。
 * 秘匿情報・削除済み・非 local ソース なら null。
 * 不正な日時や期間逆転も null を返す。
 */
export function googlePushBody(event: GooglePushEvent): GooglePushBody | null {
  if (event.source !== 'local' || event.is_secret || event.deleted_at !== null) {
    return null;
  }

  const id = (typeof event.id === 'string' ? event.id : '').trim();
  const title = (typeof event.title === 'string' ? event.title : '').trim();
  if (!id || !title) {
    return null;
  }

  const note = event.note || '';
  const location = event.location || '';

  if (event.all_day) {
    const eventDate = typeof event.event_date === 'string' ? event.event_date : '';
    if (!isValidDate(eventDate)) {
      return null;
    }
    return {
      summary: title,
      description: note,
      location,
      start: { date: eventDate, dateTime: null },
      end: { date: nextDay(eventDate), dateTime: null },
      extendedProperties: { private: { multiCalendarEventId: id } },
    };
  }

  const startsAt = typeof event.starts_at === 'string' ? event.starts_at : '';
  const endsAt = typeof event.ends_at === 'string' ? event.ends_at : '';

  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }

  if (endMs <= startMs) {
    return null;
  }

  return {
    summary: title,
    description: note,
    location,
    start: { dateTime: new Date(startMs).toISOString(), date: null },
    end: { dateTime: new Date(endMs).toISOString(), date: null },
    extendedProperties: { private: { multiCalendarEventId: id } },
  };
}
