import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Calendar } from '@/data/calendars';

const authState = {
  current: 'guest' as 'guest' | 'authenticated' | 'unavailable' | 'loading',
};
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({ state: authState.current, session: null, email: null, signOut: vi.fn() }),
}));

const hookValue = {
  calendars: [] as Calendar[],
  loading: false,
  errorKey: null as string | null,
  pendingDelete: null as Calendar | null,
  reload: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  recolor: vi.fn(),
  toggleVisible: vi.fn(),
  remove: vi.fn(),
  undoDelete: vi.fn(),
  dismissError: vi.fn(),
};
vi.mock('../model/useCalendars', () => ({ useCalendars: () => hookValue }));

const { CalendarsScreen } = await import('./CalendarsScreen');

const cal = (over: Partial<Calendar> = {}): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#0072B2',
  source: 'local',
  isShift: false,
  isVisible: true,
  createdAt: '2026-09-07T00:00:00Z',
  updatedAt: '2026-09-07T00:00:00Z',
  ...over,
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <CalendarsScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.current = 'guest';
  hookValue.calendars = [];
  hookValue.loading = false;
  hookValue.errorKey = null;
  hookValue.pendingDelete = null;
  Object.values(hookValue).forEach(
    (v) => typeof v === 'function' && (v as ReturnType<typeof vi.fn>).mockReset?.(),
  );
});
afterEach(() => vi.restoreAllMocks());

describe('CalendarsScreen', () => {
  it('unavailable なら無効メッセージを出し、作成ボタンを出さない', () => {
    authState.current = 'unavailable';
    renderScreen();
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /カレンダーを作成/ })).not.toBeInTheDocument();
  });

  it('カレンダー一覧を描画する', () => {
    hookValue.calendars = [
      cal({ id: 's1', name: 'シフト', isShift: true }),
      cal({ name: '仕事' }),
    ];
    renderScreen();
    expect(screen.getByText('シフト')).toBeInTheDocument();
    expect(screen.getByText('仕事')).toBeInTheDocument();
    expect(screen.getByText('シフト用')).toBeInTheDocument();
  });

  it('シフト用カレンダーの編集シートに削除ボタンが無い', async () => {
    const user = userEvent.setup();
    hookValue.calendars = [cal({ id: 's1', name: 'シフト', isShift: true })];
    renderScreen();
    await user.click(screen.getByRole('button', { name: /シフト/ }));
    expect(screen.getByRole('dialog', { name: 'カレンダーを編集' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'このカレンダーを削除' }),
    ).not.toBeInTheDocument();
  });

  it('通常カレンダーの編集シートには削除ボタンがある', async () => {
    const user = userEvent.setup();
    hookValue.calendars = [cal({ name: '仕事' })];
    renderScreen();
    await user.click(screen.getByRole('button', { name: /仕事/ }));
    expect(screen.getByRole('button', { name: 'このカレンダーを削除' })).toBeInTheDocument();
  });

  it('pendingDelete があれば Undo バーを出す', () => {
    hookValue.pendingDelete = cal({ name: '個人' });
    renderScreen();
    expect(screen.getByText(/「個人」を削除しました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取り消す' })).toBeInTheDocument();
  });
});
