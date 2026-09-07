import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';

const calendar: Calendar = {
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
};

const sampleEvent: EventItem = {
  id: 'e1',
  calendarId: 'c1',
  title: '会議アルファ',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  createdAt: '',
  updatedAt: '',
};

let authState: { state: string } = { state: 'guest' };
let calState: Record<string, unknown>;
let evState: Record<string, unknown>;

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/features/calendars/model/useCalendars', () => ({ useCalendars: () => calState }));
vi.mock('@/features/events/model/useEvents', () => ({ useEvents: () => evState }));

const { CalendarScreen } = await import('./CalendarScreen');

beforeEach(() => {
  authState = { state: 'guest' };
  calState = {
    calendars: [calendar],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    dismissError: vi.fn(),
  };
  evState = {
    events: [sampleEvent],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn(),
    undoDelete: vi.fn(),
    dismissError: vi.fn(),
  };
});

describe('CalendarScreen', () => {
  it('既定は月ビュー(日セルの追加ボタンを描画)', () => {
    render(<CalendarScreen />);
    expect(screen.getByRole('radio', { name: '月', checked: true })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '9月15日に予定を追加' }),
    ).toBeInTheDocument();
  });

  it('「リスト」を選ぶとリストビューに切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: 'リスト' }));
    // 会議アルファ が日付見出しの下に出る
    expect(screen.getByText('会議アルファ')).toBeInTheDocument();
    expect(screen.getByText('9月8日(火)')).toBeInTheDocument();
  });

  it('月ビューで日セルをタップすると予定追加シートが開く', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('button', { name: '9月15日に予定を追加' }));
    expect(screen.getByRole('dialog', { name: '予定を追加' })).toBeInTheDocument();
  });

  it('ev.errorKey があるとアラートを表示する', () => {
    evState.errorKey = 'event/offline';
    render(<CalendarScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('オフライン');
  });

  it('cal.errorKey があるとアラートを表示する', () => {
    calState.errorKey = 'data/query';
    render(<CalendarScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗');
  });

  it('unavailable では設定を促す文言のみ', () => {
    authState = { state: 'unavailable' };
    render(<CalendarScreen />);
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '月' })).not.toBeInTheDocument();
  });
});
