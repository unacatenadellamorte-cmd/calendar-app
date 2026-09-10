import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, appError } from '@/data/result';

const navigate = vi.fn();
const listConnectionCalendars = vi.fn();
const refreshGoogleCalendars = vi.fn();
const setGoogleCalendarSelected = vi.fn();
let authState = { state: 'authenticated' };
let envValue = { hasSupabase: true, hasGoogleOauth: true };
let connectionValue: { connection: unknown; loading: boolean } = {
  connection: { id: 'c1', provider: 'google', googleEmail: 'me@gmail.com', createdAt: 'x' },
  loading: false,
};

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));
vi.mock('@/features/connections/model/useGoogleConnection', () => ({
  useGoogleConnection: () => connectionValue,
}));
vi.mock('@/data/google-calendars', () => ({
  listConnectionCalendars: () => listConnectionCalendars(),
  refreshGoogleCalendars: () => refreshGoogleCalendars(),
  setGoogleCalendarSelected: (...a: unknown[]) => setGoogleCalendarSelected(...a),
}));

const { GoogleCalendarPicker } = await import('./GoogleCalendarPicker');

const choice = (over: Record<string, unknown> = {}) => ({
  externalCalendarId: 'a@g',
  summary: '個人',
  backgroundColor: '#4285F4',
  selected: false,
  lastSyncedAt: null,
  lastError: null,
  ...over,
});

beforeEach(() => {
  navigate.mockReset();
  listConnectionCalendars.mockReset().mockResolvedValue(ok([choice(), choice({ externalCalendarId: 'b@g', summary: '部活' })]));
  refreshGoogleCalendars.mockReset().mockResolvedValue(ok({ count: 2 }));
  setGoogleCalendarSelected.mockReset().mockResolvedValue(ok(undefined));
  authState = { state: 'authenticated' };
  envValue = { hasSupabase: true, hasGoogleOauth: true };
  connectionValue = {
    connection: { id: 'c1', provider: 'google', googleEmail: 'me@gmail.com', createdAt: 'x' },
    loading: false,
  };
});

describe('GoogleCalendarPicker', () => {
  it('未接続なら設定へ戻す案内を出し、関数を呼ばない', () => {
    connectionValue = { connection: null, loading: false };
    render(<GoogleCalendarPicker />);
    expect(screen.getByText('先に Google を接続してください')).toBeInTheDocument();
    expect(refreshGoogleCalendars).not.toHaveBeenCalled();
  });

  it('接続済み: カタログを出し、Google から取り直す', async () => {
    render(<GoogleCalendarPicker />);
    expect(await screen.findByText('個人')).toBeInTheDocument();
    expect(screen.getByText('部活')).toBeInTheDocument();
    await waitFor(() => expect(refreshGoogleCalendars).toHaveBeenCalledTimes(1));
  });

  it('チェックで setGoogleCalendarSelected(id, true) を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<GoogleCalendarPicker />);
    await screen.findByText('個人');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    expect(setGoogleCalendarSelected).toHaveBeenCalledWith('a@g', true);
  });

  it('トグル失敗でロールバックしエラー表示', async () => {
    setGoogleCalendarSelected.mockResolvedValue(
      err(appError('connection/calendars-failed', 'connection/calendars-failed')),
    );
    const user = userEvent.setup();
    render(<GoogleCalendarPicker />);
    await screen.findByText('個人');
    const cb = screen.getAllByRole('checkbox')[0]!;
    await user.click(cb);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした'));
    expect((cb as HTMLInputElement).checked).toBe(false);
  });

  it('選択済みカレンダー: 最終取り込み時刻 / 失敗を行ごとに出す', async () => {
    listConnectionCalendars.mockResolvedValue(
      ok([
        choice({ externalCalendarId: 'a@g', summary: '個人', selected: true, lastSyncedAt: '2026-09-11T05:30:00Z' }),
        choice({ externalCalendarId: 'b@g', summary: '部活', selected: true, lastError: 'sync-failed' }),
        choice({ externalCalendarId: 'c@g', summary: '未選択', selected: false }),
      ]),
    );
    refreshGoogleCalendars.mockResolvedValue(ok({ count: 3 }));
    render(<GoogleCalendarPicker />);
    await screen.findByText('個人');
    expect(screen.getByText(/最終取り込み: .*9\/11/)).toBeInTheDocument();
    expect(screen.getByText('前回は取り込めませんでした')).toBeInTheDocument();
    // 未選択の行には注記を出さない
    expect(screen.queryAllByText('まだ取り込んでいません')).toHaveLength(0);
  });

  it('取り直しに失敗してもカタログは出し続ける', async () => {
    refreshGoogleCalendars.mockResolvedValue(
      err(appError('connection/reauth-needed', 'connection/reauth-needed')),
    );
    render(<GoogleCalendarPicker />);
    expect(await screen.findByText('個人')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('接続し直してください'),
    );
  });
});
