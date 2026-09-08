import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import type { EventItem } from '@/data/events';
import { localDateOf } from '@/lib/datetime';
import { useCalendars } from '@/features/calendars/model/useCalendars';
import { useEvents } from '@/features/events/model/useEvents';
import { useFeaturedCount } from '@/features/compact/model/featuredCount';
import { useFeaturedEvents } from '@/features/compact/model/useFeaturedEvents';
import { CompactCard } from '@/features/compact/ui/CompactCard';
import { PayCard } from '@/features/pay/ui/PayCard';

/**
 * ホーム。この後の代表予定を優先度順で出すコンパクトビュー。
 * 給料見込みカードは Epic 4 でこの下に追加する。
 */
export function HomeScreen() {
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const ev = useEvents(enabled);
  const navigate = useNavigate();
  const count = useFeaturedCount();
  const featured = useFeaturedEvents(ev.events, cal.calendars, count);
  const calendarById = useMemo(
    () => new Map(cal.calendars.map((c) => [c.id, c])),
    [cal.calendars],
  );

  const openDay = (event: EventItem) => {
    const date = event.allDay
      ? event.eventDate
      : event.startsAt
        ? localDateOf(event.startsAt)
        : null;
    if (date) navigate(`/calendar?date=${date}`);
  };

  return (
    <Screen
      title="今日"
      action={
        <Link to="/calendars" className="text-meta text-accent">
          カレンダーの並び順 ›
        </Link>
      }
    >
      {ev.loading || cal.loading ? (
        <p className="text-meta text-ink-secondary">読み込み中…</p>
      ) : (
        <>
          <CompactCard featured={featured} calendarById={calendarById} onSelect={openDay} />
          <PayCard events={ev.events} calendars={cal.calendars} />
        </>
      )}
    </Screen>
  );
}
