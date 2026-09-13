import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, appError } from '@/data/result';

const navigate = vi.fn();
const startGoogleConnect = vi.fn();
const getConnection = vi.fn();
const syncGoogleCalendarsNow = vi.fn();
const listSyncState = vi.fn();
const disconnectGoogle = vi.fn();
const getDisconnectImpact = vi.fn();
const refetch = vi.fn();
const connectDevice = vi.fn();
const isDeviceCalendarSupported = vi.fn();
let authState: { state: string } = { state: 'authenticated' };
let envValue = { hasSupabase: true, hasGoogleOauth: true };
let deviceConnectionValue: { connection: unknown; loading: boolean; errorKey: string | null; refresh: () => void } = {
  connection: null,
  loading: false,
  errorKey: null,
  refresh: vi.fn(),
};

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/app/online-context', () => ({ useOnline: () => ({ refetch }) }));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));
vi.mock('@/data/connections', () => ({
  startGoogleConnect: () => startGoogleConnect(),
  getConnection: () => getConnection(),
  disconnectGoogle: () => disconnectGoogle(),
  getDisconnectImpact: (...a: unknown[]) => getDisconnectImpact(...a),
  GOOGLE_CALLBACK_PATH: '/connections/google/callback',
}));
vi.mock('@/data/google-sync', () => ({
  syncGoogleCalendarsNow: () => syncGoogleCalendarsNow(),
  listSyncState: () => listSyncState(),
}));
vi.mock('@/data/device-connections', () => ({
  connectDevice: () => connectDevice(),
}));
vi.mock('@/platform/deviceCalendar', () => ({
  isDeviceCalendarSupported: () => isDeviceCalendarSupported(),
}));
vi.mock('@/features/connections/model/useDeviceConnection', () => ({
  useDeviceConnection: () => deviceConnectionValue,
}));

const { ConnectionsSection } = await import('./ConnectionsSection');

const connected = ok({ id: 'c1', provider: 'google', googleEmail: 'me@gmail.com', createdAt: 'x' });

beforeEach(() => {
  navigate.mockReset();
  startGoogleConnect.mockReset();
  getConnection.mockReset().mockResolvedValue(ok(null));
  syncGoogleCalendarsNow.mockReset().mockResolvedValue(ok({ synced: [], errors: [] }));
  listSyncState.mockReset().mockResolvedValue(ok([]));
  disconnectGoogle.mockReset().mockResolvedValue(ok({ events: 252, calendars: 1 }));
  getDisconnectImpact.mockReset().mockResolvedValue(ok({ events: 252, calendars: 1 }));
  refetch.mockReset();
  connectDevice.mockReset().mockResolvedValue(ok(undefined));
  isDeviceCalendarSupported.mockReset().mockReturnValue(true);
  authState = { state: 'authenticated' };
  envValue = { hasSupabase: true, hasGoogleOauth: true };
  deviceConnectionValue = { connection: null, loading: false, errorKey: null, refresh: vi.fn() };
});

describe('ConnectionsSection', () => {
  it('authenticated・未接続: 「Google を接続」ボタンで startGoogleConnect を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    const btn = await screen.findByRole('button', { name: 'Google を接続' });
    await user.click(btn);
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
  });

  it('authenticated・接続済み: email と接続中を表示、接続ボタンは出さない', async () => {
    getConnection.mockResolvedValue(connected);
    render(<ConnectionsSection />);
    expect(await screen.findByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Google に接続中')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google を接続' })).not.toBeInTheDocument();
  });

  it('guest: 「ログインして接続」で /auth へ。Google へは飛ばさない', async () => {
    authState = { state: 'guest' };
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    // Google ブロック・端末カレンダーブロックの両方に「ログインして接続」が出る(並ぶブロック)。
    const [loginButton] = screen.getAllByRole('button', { name: 'ログインして接続' });
    await user.click(loginButton!);
    expect(navigate).toHaveBeenCalledWith('/auth');
    expect(startGoogleConnect).not.toHaveBeenCalled();
  });

  it('OAuth クライアント ID 未設定: 設定待ちの案内、Google の接続 UI なし', () => {
    envValue = { hasSupabase: true, hasGoogleOauth: false };
    render(<ConnectionsSection />);
    expect(screen.getByText(/まだ設定されていません/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google を接続' })).not.toBeInTheDocument();
    // 端末カレンダーは Google の OAuth 設定に依存しない(並ぶ独立ブロック)。
    expect(screen.getByRole('button', { name: '端末カレンダーを接続' })).toBeInTheDocument();
  });

  it('Supabase 未設定: その旨を案内(Google・端末カレンダーの両ブロック)', () => {
    envValue = { hasSupabase: false, hasGoogleOauth: false };
    authState = { state: 'unavailable' };
    render(<ConnectionsSection />);
    expect(screen.getAllByText(/Supabase を設定すると/)).toHaveLength(2);
  });

  it('接続状態の取得に失敗したら alert を出す', async () => {
    getConnection.mockResolvedValue({
      ok: false,
      error: { kind: 'data/query', messageKey: 'data/query' },
    });
    render(<ConnectionsSection />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗'));
  });

  it('接続済み: 取り込み履歴なしは「まだ取り込んでいません」', async () => {
    getConnection.mockResolvedValue(connected);
    render(<ConnectionsSection />);
    expect(await screen.findByText('まだ取り込んでいません')).toBeInTheDocument();
  });

  it('接続済み: sync_state の最大 lastSyncedAt を「最終取り込み」に出す', async () => {
    getConnection.mockResolvedValue(connected);
    listSyncState.mockResolvedValue(
      ok([
        { calendarId: 'c1', externalCalendarId: 'a', lastSyncedAt: '2026-09-10T00:00:00Z', lastError: null },
        { calendarId: 'c2', externalCalendarId: 'b', lastSyncedAt: '2026-09-11T05:30:00Z', lastError: null },
      ]),
    );
    render(<ConnectionsSection />);
    expect(await screen.findByText(/最終取り込み:/)).toHaveTextContent('9/11');
  });

  it('「今すぐ取り込み」成功: 新規件数を表示', async () => {
    getConnection.mockResolvedValue(connected);
    syncGoogleCalendarsNow.mockResolvedValue(
      ok({ synced: [{ calendar: 'ゴミ', upserted: 4, deleted: 0 }], errors: [] }),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '今すぐ取り込み' }));
    expect(await screen.findByText('取り込みました(4 件)')).toBeInTheDocument();
    expect(listSyncState).toHaveBeenCalledTimes(2); // 初回 + 取り込み後
    expect(refetch).toHaveBeenCalled(); // 月/週/リストの予定も取り直す(Epic 3 retro F8)
  });

  it('「今すぐ取り込み」失敗: エラー文言を alert で出す', async () => {
    getConnection.mockResolvedValue(connected);
    syncGoogleCalendarsNow.mockResolvedValue({
      ok: false,
      error: { kind: 'sync/failed', messageKey: 'sync/failed' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '今すぐ取り込み' }));
    await waitFor(() =>
      expect(screen.getByText('取り込みに失敗しました。時間をおいてもう一度お試しください')).toBeInTheDocument(),
    );
  });

  it('「今すぐ取り込み」でオフライン: オフライン文言', async () => {
    getConnection.mockResolvedValue(connected);
    syncGoogleCalendarsNow.mockResolvedValue({
      ok: false,
      error: { kind: 'data/offline', messageKey: 'data/offline' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '今すぐ取り込み' }));
    await waitFor(() =>
      expect(screen.getByText('オフラインです。接続すると同期します')).toBeInTheDocument(),
    );
  });

  it('接続済み: 「接続を解除」→ 確認シートに影響件数、確定で disconnectGoogle + refetch + 未接続へ', async () => {
    getConnection.mockResolvedValue(connected);
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '接続を解除' }));

    const dialog = await screen.findByRole('dialog', { name: 'Google 接続を解除' });
    await waitFor(() => expect(dialog).toHaveTextContent('予定 252 件'));

    // 解除後は getConnection が null を返す(接続欄が未接続へ)
    getConnection.mockResolvedValue(ok(null));
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));

    expect(disconnectGoogle).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Google を接続' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/接続を解除しました/)).toBeInTheDocument();
  });

  it('接続解除の RPC が失敗: シートにエラー、接続状態は変わらない', async () => {
    getConnection.mockResolvedValue(connected);
    disconnectGoogle.mockResolvedValue({
      ok: false,
      error: { kind: 'connection/disconnect-failed', messageKey: 'connection/disconnect-failed' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '接続を解除' }));
    const dialog = await screen.findByRole('dialog', { name: 'Google 接続を解除' });
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));
    await waitFor(() =>
      expect(within(dialog).getByText('接続の解除に失敗しました。もう一度お試しください')).toBeInTheDocument(),
    );
    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
  });

  it('未接続 / guest: 「接続を解除」は出さない', async () => {
    render(<ConnectionsSection />); // getConnection = ok(null)
    await screen.findByRole('button', { name: 'Google を接続' });
    expect(screen.queryByRole('button', { name: '接続を解除' })).not.toBeInTheDocument();
  });

  it('影響件数の取得に失敗しても解除は可能(件数は「—」)', async () => {
    getConnection.mockResolvedValue(connected);
    getDisconnectImpact.mockResolvedValue({
      ok: false,
      error: { kind: 'data/query', messageKey: 'data/query' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '接続を解除' }));
    const dialog = await screen.findByRole('dialog', { name: 'Google 接続を解除' });
    expect(dialog).toHaveTextContent('予定 —');
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));
    expect(disconnectGoogle).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectionsSection の端末カレンダーブロック(Story 5.2)', () => {
  it('authenticated・未接続: 「端末カレンダーを接続」ボタンで connectDevice を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    const btn = await screen.findByRole('button', { name: '端末カレンダーを接続' });
    await user.click(btn);
    expect(connectDevice).toHaveBeenCalledTimes(1);
    expect(deviceConnectionValue.refresh).toHaveBeenCalledTimes(1);
  });

  it('権限拒否: エラー文言を表示し、ボタンが「もう一度許可する」に変わる', async () => {
    connectDevice.mockResolvedValue(
      err(appError('connection/permission-denied', 'connection/permission-denied')),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '端末カレンダーを接続' }));
    await waitFor(() =>
      expect(
        screen.getByText(/端末カレンダーへのアクセスが許可されませんでした/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'もう一度許可する' })).toBeInTheDocument();
  });

  it('接続済み: 「取り込むカレンダーを選ぶ」で /connections/device/calendars へ', async () => {
    deviceConnectionValue = {
      connection: { id: 'd1', provider: 'device', createdAt: 'x' },
      loading: false,
      errorKey: null,
      refresh: vi.fn(),
    };
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '取り込むカレンダーを選ぶ' }));
    expect(navigate).toHaveBeenCalledWith('/connections/device/calendars');
  });

  it('Web/PWA(isDeviceCalendarSupported=false)ではブロック自体を表示しない', async () => {
    isDeviceCalendarSupported.mockReturnValue(false);
    render(<ConnectionsSection />);
    // Google ブロックは影響を受けない(読み込み完了を待ってから判定)。
    expect(await screen.findByRole('button', { name: 'Google を接続' })).toBeInTheDocument();
    expect(screen.queryByText('端末カレンダーを接続')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '端末カレンダーを接続' })).not.toBeInTheDocument();
  });
});
