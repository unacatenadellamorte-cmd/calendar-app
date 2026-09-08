import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { resetFeaturedCountForTests, setFeaturedCount } from '@/features/compact/model/featuredCount';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

let authState: { state: string };
let calState: Record<string, unknown>;
let evState: Record<string, unknown>;

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/features/calendars/model/useCalendars', () => ({ useCalendars: () => calState }));
vi.mock('@/features/events/model/useEvents', () => ({ useEvents: () => evState }));

const { HomeScreen } = await import('./HomeScreen');

const cal = (over: Partial<Calendar>): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const futureEvent = (over: Partial<EventItem>): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '役員会議',
  allDay: false,
  startsAt: '2026-12-25T01:00:00Z',
  endsAt: '2026-12-25T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  window.localStorage.clear();
  resetFeaturedCountForTests();
  authState = { state: 'guest' };
  calState = { calendars: [cal({ id: 'c1' })], loading: false };
  evState = { events: [], loading: false };
});

describe('HomeScreen', () => {
  it('見出しは「今日」、右にカレンダーの並び順リンク', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: '今日' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /カレンダーの並び順/ })).toBeInTheDocument();
  });

  it('この後に予定があると代表予定を行で出す', () => {
    evState.events = [futureEvent({ id: 'a', title: '役員会議' })];
    renderHome();
    expect(screen.getByRole('button', { name: /役員会議/ })).toBeInTheDocument();
  });

  it('この後に予定が無いと静かな1行', () => {
    evState.events = [
      futureEvent({ id: 'p', startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-01T01:00:00Z' }),
    ];
    renderHome();
    expect(screen.getByText('この後の予定はありません')).toBeInTheDocument();
  });

  it('compact-card の下に pay-card(給料見込み)が出る', () => {
    renderHome();
    expect(screen.getByRole('region', { name: '9月の給料見込み' })).toBeInTheDocument();
  });

  it('代表予定をタップするとその予定の日付でカレンダーへ遷移', async () => {
    const user = userEvent.setup();
    evState.events = [futureEvent({ id: 'a', title: '役員会議', startsAt: '2026-12-25T01:00:00Z', endsAt: '2026-12-25T02:00:00Z' })];
    renderHome();
    await user.click(screen.getByRole('button', { name: /役員会議/ }));
    // 01:00Z = JST 10:00、暦日は 2026-12-25。
    expect(navigateMock).toHaveBeenCalledWith('/calendar?date=2026-12-25');
  });

  it('表示件数の設定が行数の上限になる', () => {
    evState.events = [10, 11, 12].map((h) =>
      futureEvent({
        id: `e${h}`,
        title: `予定${h}`,
        startsAt: `2026-12-25T${h}:00:00Z`,
        endsAt: `2026-12-25T${h + 1}:00:00Z`,
      }),
    );

    setFeaturedCount(2);
    renderHome();
    expect(screen.getAllByRole('button', { name: /予定/ })).toHaveLength(2);
  });
});
