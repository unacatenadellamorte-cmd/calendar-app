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
let secretState: { unlocked: boolean };

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/features/calendars/model/useCalendars', () => ({ useCalendars: () => calState }));
vi.mock('@/features/events/model/useEvents', () => ({ useEvents: () => evState }));
vi.mock('@/app/secret-mode-context', () => ({ useSecretMode: () => secretState }));

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
  reminderMinutes: null,
  isSecret: false,
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
  secretState = { unlocked: false };
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

  describe('シークレット予定の除外(spec-secret-mode)', () => {
    it('ロック中(unlocked=false)はシークレット予定を代表予定から除外する', () => {
      evState.events = [
        futureEvent({ id: 'secret', title: '内緒の予定', isSecret: true }),
        futureEvent({
          id: 'normal',
          title: '普通の予定',
          startsAt: '2026-12-26T01:00:00Z',
          endsAt: '2026-12-26T02:00:00Z',
        }),
      ];
      renderHome();
      expect(screen.queryByRole('button', { name: /内緒の予定/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /普通の予定/ })).toBeInTheDocument();
    });

    it('解除中(unlocked=true)はシークレット予定も表示する', () => {
      secretState = { unlocked: true };
      evState.events = [futureEvent({ id: 'secret', title: '内緒の予定', isSecret: true })];
      renderHome();
      expect(screen.getByRole('button', { name: /内緒の予定/ })).toBeInTheDocument();
    });

    it('ロック中はシークレットのシフトを給料見込み(PayCard/usePayEstimate)の計算から除外する', () => {
      calState.calendars = [cal({ id: 'c1' }), cal({ id: 'shift1', name: 'バイト', isShift: true })];
      evState.events = [
        futureEvent({
          id: 'shift-e',
          calendarId: 'shift1',
          startsAt: '2026-09-10T00:00:00Z', // JST 09:00
          endsAt: '2026-09-10T08:00:00Z', // JST 17:00、実働8h
          breakMinutes: 0,
          hourlyWage: 1000,
          isSecret: true,
        }),
      ];
      renderHome();
      expect(screen.getByText('9月のシフトはまだありません')).toBeInTheDocument();
      expect(screen.queryByText('¥8,000')).not.toBeInTheDocument();
    });

    it('解除中はシークレットのシフトも給料見込みの計算に含める', () => {
      secretState = { unlocked: true };
      calState.calendars = [cal({ id: 'c1' }), cal({ id: 'shift1', name: 'バイト', isShift: true })];
      evState.events = [
        futureEvent({
          id: 'shift-e',
          calendarId: 'shift1',
          startsAt: '2026-09-10T00:00:00Z',
          endsAt: '2026-09-10T08:00:00Z',
          breakMinutes: 0,
          hourlyWage: 1000,
          isSecret: true,
        }),
      ];
      renderHome();
      expect(screen.getByText('¥8,000')).toBeInTheDocument();
      expect(screen.getByText('9月 ・ 1件のシフト')).toBeInTheDocument();
    });
  });
});
