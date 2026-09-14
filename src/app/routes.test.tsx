import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EventItem } from '@/data/events';

// カレンダー画面を描画可能にするため auth を guest 固定、データ層は空でモック。
vi.mock('@/app/auth-context', () => ({ useAuth: () => ({ state: 'guest' }) }));
vi.mock('@/features/calendars/model/useCalendars', () => ({
  useCalendars: () => ({ calendars: [], loading: false, errorKey: null, pendingDelete: null, dismissError: vi.fn() }),
}));

const sampleEvent: EventItem = {
  id: 'evt-1',
  calendarId: 'c1',
  title: 'ディープリンク予定',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
  createdAt: '',
  updatedAt: '',
};

// `?event=` のテスト(存在する ID / しない ID)のため、events を差し替え可能にする。
let evState: Record<string, unknown>;
vi.mock('@/features/events/model/useEvents', () => ({ useEvents: () => evState }));

vi.mock('@/features/shifts/model/useShiftTemplates', () => ({
  useShiftTemplates: () => ({
    templates: [],
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

beforeEach(() => {
  evState = {
    events: [],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    undoDelete: vi.fn(),
    dismissError: vi.fn(),
  };
});

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

describe('CalendarRoute の ?event=(ディープリンク calendar-app://event/{id} 由来)', () => {
  it('?event=<id> で該当するローカル予定の編集シートを開く', () => {
    evState.events = [sampleEvent];
    renderAt('/calendar?event=evt-1');
    expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
  });

  it('?event= に存在しない ID なら静かにフォールバックする(エラー・シートなし)', () => {
    evState.events = [sampleEvent];
    renderAt('/calendar?event=not-found');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('?event= が無ければ何も開かない', () => {
    evState.events = [sampleEvent];
    renderAt('/calendar');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('その他のルート', () => {
  it('/shift-templates でお気に入りシフト画面が出る', () => {
    renderAt('/shift-templates');
    expect(screen.getByRole('heading', { level: 1, name: 'お気に入りシフト' })).toBeInTheDocument();
  });
});
