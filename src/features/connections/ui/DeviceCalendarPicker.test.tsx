import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, appError } from '@/data/result';

const navigate = vi.fn();
const listDeviceCalendars = vi.fn();
const refreshDeviceCalendarCatalog = vi.fn();
const setDeviceCalendarSelected = vi.fn();
let authState = { state: 'authenticated' };
let envValue = { hasSupabase: true };
let connectionValue: { connection: unknown; loading: boolean } = {
  connection: { id: 'd1', provider: 'device', createdAt: 'x' },
  loading: false,
};

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));
vi.mock('@/features/connections/model/useDeviceConnection', () => ({
  useDeviceConnection: () => connectionValue,
}));
vi.mock('@/data/device-calendars', () => ({
  listDeviceCalendars: (...a: unknown[]) => listDeviceCalendars(...a),
  refreshDeviceCalendarCatalog: (...a: unknown[]) => refreshDeviceCalendarCatalog(...a),
  setDeviceCalendarSelected: (...a: unknown[]) => setDeviceCalendarSelected(...a),
  DEFAULT_NAME: '端末のカレンダー',
  DEFAULT_COLOR: '#7A7A7A',
}));

const { DeviceCalendarPicker } = await import('./DeviceCalendarPicker');

const choice = (over: Record<string, unknown> = {}) => ({
  externalCalendarId: 'cal-a',
  summary: '個人',
  backgroundColor: '#4285F4',
  selected: false,
  ...over,
});

beforeEach(() => {
  navigate.mockReset();
  listDeviceCalendars
    .mockReset()
    .mockResolvedValue(ok([choice(), choice({ externalCalendarId: 'cal-b', summary: '部活' })]));
  refreshDeviceCalendarCatalog.mockReset().mockResolvedValue(ok({ count: 2 }));
  setDeviceCalendarSelected.mockReset().mockResolvedValue(ok(undefined));
  authState = { state: 'authenticated' };
  envValue = { hasSupabase: true };
  connectionValue = {
    connection: { id: 'd1', provider: 'device', createdAt: 'x' },
    loading: false,
  };
});

describe('DeviceCalendarPicker', () => {
  it('未接続なら設定へ戻す案内を出し、関数を呼ばない', () => {
    connectionValue = { connection: null, loading: false };
    render(<DeviceCalendarPicker />);
    expect(screen.getByText('先に端末カレンダーを接続してください')).toBeInTheDocument();
    expect(refreshDeviceCalendarCatalog).not.toHaveBeenCalled();
  });

  it('接続済み: カタログを出し、端末から取り直す', async () => {
    render(<DeviceCalendarPicker />);
    expect(await screen.findByText('個人')).toBeInTheDocument();
    expect(screen.getByText('部活')).toBeInTheDocument();
    await waitFor(() => expect(refreshDeviceCalendarCatalog).toHaveBeenCalledWith('d1'));
  });

  it('チェックで setDeviceCalendarSelected(connectionId, id, true) を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<DeviceCalendarPicker />);
    await screen.findByText('個人');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    expect(setDeviceCalendarSelected).toHaveBeenCalledWith('d1', 'cal-a', true);
  });

  it('トグル失敗でロールバックしエラー表示', async () => {
    setDeviceCalendarSelected.mockResolvedValue(
      err(appError('connection/calendars-failed', 'connection/calendars-failed')),
    );
    const user = userEvent.setup();
    render(<DeviceCalendarPicker />);
    await screen.findByText('個人');
    const cb = screen.getAllByRole('checkbox')[0]!;
    await user.click(cb);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした'));
    expect((cb as HTMLInputElement).checked).toBe(false);
  });

  it('取り直しに失敗してもカタログは出し続ける', async () => {
    refreshDeviceCalendarCatalog.mockResolvedValue(
      err(appError('data/query', 'data/query')),
    );
    render(<DeviceCalendarPicker />);
    expect(await screen.findByText('個人')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗'));
  });
});
