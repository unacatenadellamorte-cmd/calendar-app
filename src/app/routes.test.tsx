import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// カレンダー画面を描画可能にするため auth を guest 固定、データ層は空でモック。
vi.mock('@/app/auth-context', () => ({ useAuth: () => ({ state: 'guest' }) }));
vi.mock('@/features/calendars/model/useCalendars', () => ({
  useCalendars: () => ({ calendars: [], loading: false, errorKey: null, pendingDelete: null, dismissError: vi.fn() }),
}));
vi.mock('@/features/events/model/useEvents', () => ({
  useEvents: () => ({
    events: [],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    undoDelete: vi.fn(),
    dismissError: vi.fn(),
  }),
}));

const { AppRoutes } = await import('./routes');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('CalendarRoute の ?date=', () => {
  it('?date=YYYY-MM-DD でその月を開く', () => {
    renderAt('/calendar?date=2026-12-25');
    expect(screen.getByRole('button', { name: '2026年12月' })).toBeInTheDocument();
  });

  it('?date が不正な形なら無視して今日の月を開く(壊れない)', () => {
    renderAt('/calendar?date=not-a-date');
    // 今日(2026-09-08 前提の環境)の月。少なくとも「2026年」を含む見出しが1つ出る。
    expect(screen.getByRole('button', { name: /年\d+月$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /NaN/ })).not.toBeInTheDocument();
  });

  it('?date 無しなら今日の月', () => {
    renderAt('/calendar');
    expect(screen.getByRole('button', { name: /年\d+月$/ })).toBeInTheDocument();
  });
});
