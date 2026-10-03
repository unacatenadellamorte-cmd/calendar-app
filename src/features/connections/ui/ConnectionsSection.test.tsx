import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, appError } from '@/data/result';

const navigate = vi.fn();
const startGoogleConnect = vi.fn();
const listConnections = vi.fn();
const syncGoogleCalendarsNow = vi.fn();
const listSyncState = vi.fn();
const disconnectGoogle = vi.fn();
const getDisconnectImpact = vi.fn();
const refetch = vi.fn();
const connectDevice = vi.fn();
const disconnectDevice = vi.fn();
const syncDeviceCalendarsNow = vi.fn();
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
  listConnections: () => listConnections(),
  disconnectGoogle: (...a: unknown[]) => disconnectGoogle(...a),
  getDisconnectImpact: (...a: unknown[]) => getDisconnectImpact(...a),
  GOOGLE_CALLBACK_PATH: '/connections/google/callback',
}));
vi.mock('@/data/google-sync', () => ({
  syncGoogleCalendarsNow: () => syncGoogleCalendarsNow(),
  listSyncState: () => listSyncState(),
}));
vi.mock('@/data/device-connections', () => ({
  connectDevice: () => connectDevice(),
  disconnectDevice: (...a: unknown[]) => disconnectDevice(...a),
}));
vi.mock('@/data/device-sync', () => ({
  syncDeviceCalendarsNow: () => syncDeviceCalendarsNow(),
}));
vi.mock('@/platform/deviceCalendar', () => ({
  isDeviceCalendarSupported: () => isDeviceCalendarSupported(),
}));
vi.mock('@/features/connections/model/useDeviceConnection', () => ({
  useDeviceConnection: () => deviceConnectionValue,
}));

let entitlementsValue = { loading: false, hasMultiAccount: false, canWrite: false, reload: vi.fn() };
vi.mock('@/features/billing/model/useEntitlements', () => ({
  useEntitlements: () => entitlementsValue,
}));

/** 初回接続時のプラン案内を「表示済み」にする localStorage キー(planSheetSeen.ts)。 */
const PLAN_SHEET_SEEN_KEY = 'calendar-app.plan-sheet-seen';

const { ConnectionsSection } = await import('./ConnectionsSection');

const connectedOne = { id: 'c1', provider: 'google', googleEmail: 'me@gmail.com', createdAt: 'x', status: 'active' as const };
const connectedWork = { id: 'c2', provider: 'google', googleEmail: 'work@gmail.com', createdAt: 'y', status: 'active' as const };
const suspendedOld = { id: 'c3', provider: 'google', googleEmail: 'old@gmail.com', createdAt: 'z', status: 'suspended' as const };

beforeEach(() => {
  navigate.mockReset();
  startGoogleConnect.mockReset();
  listConnections.mockReset().mockResolvedValue(ok([]));
  syncGoogleCalendarsNow.mockReset().mockResolvedValue(ok({ synced: [], errors: [] }));
  listSyncState.mockReset().mockResolvedValue(ok([]));
  disconnectGoogle.mockReset().mockResolvedValue(ok({ events: 252, calendars: 1 }));
  getDisconnectImpact.mockReset().mockResolvedValue(ok({ events: 252, calendars: 1 }));
  refetch.mockReset();
  connectDevice.mockReset().mockResolvedValue(ok(undefined));
  disconnectDevice.mockReset().mockResolvedValue(ok({ events: 12, calendars: 1 }));
  syncDeviceCalendarsNow.mockReset().mockResolvedValue(ok({ synced: [], errors: [] }));
  isDeviceCalendarSupported.mockReset().mockReturnValue(true);
  authState = { state: 'authenticated' };
  envValue = { hasSupabase: true, hasGoogleOauth: true };
  deviceConnectionValue = { connection: null, loading: false, errorKey: null, refresh: vi.fn() };
  entitlementsValue = { loading: false, hasMultiAccount: false, canWrite: false, reload: vi.fn() };
  localStorage.clear();
  // 既存の接続フローのテストはプラン案内を表示済みの状態で行う(案内の出し分けは別 describe)。
  localStorage.setItem(PLAN_SHEET_SEEN_KEY, '1');
});

afterEach(async () => {
  // 読み込み後のeffectを解決してからモックを片付ける。
  await act(async () => {});
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ConnectionsSection', () => {
  it('authenticated・未接続: 「Google を接続」ボタンで startGoogleConnect を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    const btn = await screen.findByRole('button', { name: 'Google を接続' });
    await user.click(btn);
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
  });

  it('Android認可中は連打を防ぎ、完了後は再取得してカレンダー選択へ進む', async () => {
    let complete!: (value: unknown) => void;
    startGoogleConnect.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    expect(screen.getByRole('button', { name: '確認中…' })).toBeDisabled();
    complete(ok({ googleEmail: 'me@gmail.com' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/connections/google/calendars'));
    // 接続状態の再取得はReactのeffectで走るため、その完了も待つ。
    await waitFor(() => expect(listConnections).toHaveBeenCalledTimes(2));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('認可待ちで画面を離れた後の成功は移動・再取得へ反映しない', async () => {
    let complete!: (value: unknown) => void;
    startGoogleConnect.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const user = userEvent.setup();
    const { unmount } = render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    unmount();
    await act(async () => { complete(ok({ googleEmail: 'me@gmail.com' })); });
    expect(navigate).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    expect(listConnections).toHaveBeenCalledTimes(1);
  });

  it('認可取消後はエラーを出し再試行できる', async () => {
    startGoogleConnect.mockResolvedValue(err(appError('connection/cancelled', 'connection/cancelled')));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Google を接続' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('authenticated・接続済み: email と接続中を表示、「Google アカウントを追加」ボタンを出す', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    render(<ConnectionsSection />);
    expect(await screen.findByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Google に接続中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google アカウントを追加' })).toBeInTheDocument();
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
    listConnections.mockResolvedValue({
      ok: false,
      error: { kind: 'data/query', messageKey: 'data/query' },
    });
    render(<ConnectionsSection />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗'));
  });

  it('接続済み: 取り込み履歴なしは「まだ取り込んでいません」', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    render(<ConnectionsSection />);
    expect(await screen.findByText('まだ取り込んでいません')).toBeInTheDocument();
  });

  it('接続済み: sync_state の最大 lastSyncedAt を「最終取り込み」に出す', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
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
    listConnections.mockResolvedValue(ok([connectedOne]));
    syncGoogleCalendarsNow.mockResolvedValue(
      ok({ synced: [{ calendar: 'ゴミ', upserted: 4, deleted: 0 }], errors: [] }),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google の今すぐ取り込み' }));
    expect(await screen.findByText('取り込みました(4 件)')).toBeInTheDocument();
    expect(listSyncState).toHaveBeenCalledTimes(2); // 初回 + 取り込み後
    expect(refetch).toHaveBeenCalled(); // 月/週/リストの予定も取り直す(Epic 3 retro F8)
  });

  it('取り込み中は残留したオフライン表示を隠し、完了後に通常表示へ戻す', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    let resolveSync!: (value: unknown) => void;
    syncGoogleCalendarsNow.mockReturnValue(new Promise((resolve) => { resolveSync = resolve; }));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    const button = await screen.findByRole('button', { name: 'Google の今すぐ取り込み' });
    await user.click(button);
    await waitFor(() => expect(screen.getAllByText('同期中')).toHaveLength(2));
    expect(screen.queryByText('オフラインです。接続すると同期します')).not.toBeInTheDocument();
    resolveSync(ok({ synced: [], errors: [] }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Google の今すぐ取り込み' })).toBeInTheDocument());
    expect(screen.queryByText('同期中')).not.toBeInTheDocument();
  });

  it('「今すぐ取り込み」で全カレンダーが失敗: 「一部」ではなく明確な失敗文言を出す', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    syncGoogleCalendarsNow.mockResolvedValue(
      ok({ synced: [], errors: [{ calendar: 'ゴミ', error: 'sync-failed' }] }),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google の今すぐ取り込み' }));
    expect(await screen.findByText('取り込みに失敗しました')).toBeInTheDocument();
    expect(screen.queryByText(/一部のカレンダーを取り込めませんでした/)).not.toBeInTheDocument();
  });

  it('「今すぐ取り込み」失敗: エラー文言を alert で出す', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    syncGoogleCalendarsNow.mockResolvedValue({
      ok: false,
      error: { kind: 'sync/failed', messageKey: 'sync/failed' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google の今すぐ取り込み' }));
    await waitFor(() =>
      expect(screen.getByText('取り込みに失敗しました。時間をおいてもう一度お試しください')).toBeInTheDocument(),
    );
  });

  it('「今すぐ取り込み」でオフライン: オフライン文言', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    syncGoogleCalendarsNow.mockResolvedValue({
      ok: false,
      error: { kind: 'data/offline', messageKey: 'data/offline' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google の今すぐ取り込み' }));
    await waitFor(() =>
      expect(screen.getByText('オフラインです。接続すると同期します')).toBeInTheDocument(),
    );
  });

  it('接続済み: 各接続に「解除」ボタン → 確認シートに影響件数、確定で disconnectGoogle + refetch', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'me@gmail.com の接続を解除' }));

    const dialog = await screen.findByRole('dialog', { name: 'me@gmail.com の接続を解除' });
    await waitFor(() => expect(dialog).toHaveTextContent('予定 252 件'));

    // 解除後は listConnections が空を返す(接続欄が未接続へ)
    listConnections.mockResolvedValue(ok([]));
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));

    expect(disconnectGoogle).toHaveBeenCalledWith('c1');
    expect(refetch).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Google を接続' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/接続を解除しました/)).toBeInTheDocument();
  });

  it('接続解除の RPC が失敗: シートにエラー、接続状態は変わらない', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    disconnectGoogle.mockResolvedValue({
      ok: false,
      error: { kind: 'connection/disconnect-failed', messageKey: 'connection/disconnect-failed' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'me@gmail.com の接続を解除' }));
    const dialog = await screen.findByRole('dialog', { name: 'me@gmail.com の接続を解除' });
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));
    await waitFor(() =>
      expect(within(dialog).getByText('接続の解除に失敗しました。もう一度お試しください')).toBeInTheDocument(),
    );
    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
  });

  it('未接続 / guest: 「接続を解除」ボタンは出さない', async () => {
    render(<ConnectionsSection />); // listConnections = ok([])
    await screen.findByRole('button', { name: 'Google を接続' });
    expect(screen.queryAllByRole('button', { name: /の接続を解除$/ })).toHaveLength(0);
  });

  it('影響件数の取得に失敗しても解除は可能(件数は「—」)', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    getDisconnectImpact.mockResolvedValue({
      ok: false,
      error: { kind: 'data/query', messageKey: 'data/query' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'me@gmail.com の接続を解除' }));
    const dialog = await screen.findByRole('dialog', { name: 'me@gmail.com の接続を解除' });
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

describe('ConnectionsSection の端末カレンダーの取り込み・解除(Story 5.3)', () => {
  beforeEach(() => {
    deviceConnectionValue = {
      connection: { id: 'd1', provider: 'device', createdAt: 'x' },
      loading: false,
      errorKey: null,
      refresh: vi.fn(),
    };
  });

  it('「今すぐ取り込み」成功: syncDeviceCalendarsNow を呼び、新規件数を表示して refetch する', async () => {
    syncDeviceCalendarsNow.mockResolvedValue(
      ok({ synced: [{ calendar: '仕事', upserted: 3, deleted: 0 }], errors: [] }),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    const buttons = await screen.findAllByRole('button', { name: '端末カレンダーの今すぐ取り込み' });
    // Google ブロックは未接続なのでボタンは端末カレンダー側の1つだけのはず。
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    expect(syncDeviceCalendarsNow).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('取り込みました(3 件)')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('「今すぐ取り込み」失敗: エラー文言を alert で出す', async () => {
    syncDeviceCalendarsNow.mockResolvedValue({
      ok: false,
      error: { kind: 'sync/failed', messageKey: 'sync/failed' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '端末カレンダーの今すぐ取り込み' }));
    await waitFor(() =>
      expect(
        screen.getByText('取り込みに失敗しました。時間をおいてもう一度お試しください'),
      ).toBeInTheDocument(),
    );
  });

  it('「接続を解除」→ 確認シートに影響件数、確定で disconnectDevice + refetch + 未接続表示へ', async () => {
    getDisconnectImpact.mockResolvedValue(ok({ events: 12, calendars: 1 }));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '端末カレンダーの接続を解除' }));

    const dialog = await screen.findByRole('dialog', { name: '端末カレンダー接続を解除' });
    await waitFor(() => expect(dialog).toHaveTextContent('予定 12 件'));
    expect(getDisconnectImpact).toHaveBeenCalledWith('d1');

    // 解除後は connection が null に戻る(接続欄が未接続へ)。
    deviceConnectionValue.connection = null;
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));

    expect(disconnectDevice).toHaveBeenCalledWith('d1');
    expect(refetch).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '端末カレンダーを接続' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/接続を解除しました/)).toBeInTheDocument();
  });

  it('接続解除が失敗: シートにエラー、接続状態は変わらない', async () => {
    disconnectDevice.mockResolvedValue({
      ok: false,
      error: { kind: 'connection/disconnect-failed', messageKey: 'connection/disconnect-failed' },
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '端末カレンダーの接続を解除' }));
    const dialog = await screen.findByRole('dialog', { name: '端末カレンダー接続を解除' });
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));
    await waitFor(() =>
      expect(
        within(dialog).getByText('接続の解除に失敗しました。もう一度お試しください'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('端末カレンダーに接続中')).toBeInTheDocument();
  });

  it('「今すぐ取り込み」で全カレンダーが失敗: 「一部」ではなく明確な失敗文言を出す', async () => {
    syncDeviceCalendarsNow.mockResolvedValue(
      ok({ synced: [], errors: [{ calendar: '仕事', error: 'sync-failed' }] }),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: '端末カレンダーの今すぐ取り込み' }));
    expect(await screen.findByText('取り込みに失敗しました')).toBeInTheDocument();
    expect(screen.queryByText(/一部のカレンダーを取り込めませんでした/)).not.toBeInTheDocument();
  });

  it('Google・端末の両方接続済み: 各ブロックに「今すぐ取り込み」が有り、Google は接続リストで「解除」、端末は個別ボタンで解除できる', async () => {
    listConnections.mockResolvedValue(ok([connectedOne]));
    deviceConnectionValue = {
      connection: { id: 'd1', provider: 'device', createdAt: 'x' },
      loading: false,
      errorKey: null,
      refresh: vi.fn(),
    };
    render(<ConnectionsSection />);
    expect(await screen.findByRole('button', { name: 'Google の今すぐ取り込み' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '端末カレンダーの今すぐ取り込み' })).toBeInTheDocument();
    // Google はアカウント名つき、端末は「端末カレンダーの接続を解除」で区別できる
    expect(screen.getByRole('button', { name: 'me@gmail.com の接続を解除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '端末カレンダーの接続を解除' })).toBeInTheDocument();
  });
});

describe('ConnectionsSection の複数 Google アカウント(CAP-3)', () => {
  it('接続ごとに行を出し、解除・カレンダー選択のアクセシブルネームがアカウントで区別できる', async () => {
    listConnections.mockResolvedValue(ok([connectedOne, connectedWork]));
    render(<ConnectionsSection />);
    expect(await screen.findByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('work@gmail.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'me@gmail.com の接続を解除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'work@gmail.com の接続を解除' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'me@gmail.com の取り込むカレンダーを選ぶ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'work@gmail.com の取り込むカレンダーを選ぶ' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google アカウントを追加' })).toBeInTheDocument();
  });

  it('2つ目のアカウントの解除は、その接続 ID で影響件数を取り、その接続 ID を解除する', async () => {
    listConnections.mockResolvedValue(ok([connectedOne, connectedWork]));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'work@gmail.com の接続を解除' }));
    const dialog = await screen.findByRole('dialog', { name: 'work@gmail.com の接続を解除' });
    expect(getDisconnectImpact).toHaveBeenCalledWith('c2');
    listConnections.mockResolvedValue(ok([connectedOne]));
    await user.click(within(dialog).getByRole('button', { name: '接続を解除' }));
    expect(disconnectGoogle).toHaveBeenCalledTimes(1);
    expect(disconnectGoogle).toHaveBeenCalledWith('c2');
    // 残ったアカウントはそのまま表示される
    await waitFor(() => expect(screen.queryByText('work@gmail.com')).not.toBeInTheDocument());
    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
  });

  it('カレンダー選択はその接続を指定して開く', async () => {
    listConnections.mockResolvedValue(ok([connectedOne, connectedWork]));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(
      await screen.findByRole('button', { name: 'work@gmail.com の取り込むカレンダーを選ぶ' }),
    );
    expect(navigate).toHaveBeenCalledWith('/connections/google/calendars?connection=c2');
  });

  it('suspended は「停止中」を出し、取り込み・カレンダー選択の導線を出さない(解除はできる)', async () => {
    listConnections.mockResolvedValue(ok([connectedOne, suspendedOld]));
    render(<ConnectionsSection />);
    expect(await screen.findByText('old@gmail.com')).toBeInTheDocument();
    expect(screen.getByText(/^停止中/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'old@gmail.com の取り込むカレンダーを選ぶ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'old@gmail.com の接続を解除' })).toBeInTheDocument();
    // active のアカウントは従来どおり
    expect(
      screen.getByRole('button', { name: 'me@gmail.com の取り込むカレンダーを選ぶ' }),
    ).toBeInTheDocument();
  });

  it('suspended しか無いときは「今すぐ取り込み」も出さない', async () => {
    listConnections.mockResolvedValue(ok([suspendedOld]));
    render(<ConnectionsSection />);
    expect(await screen.findByText('old@gmail.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google の今すぐ取り込み' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /の取り込むカレンダーを選ぶ$/ })).not.toBeInTheDocument();
  });
});

describe('ConnectionsSection のプラン案内(CAP-5)', () => {
  beforeEach(() => {
    localStorage.removeItem(PLAN_SHEET_SEEN_KEY);
  });

  it('接続0件で初めて「Google を接続」: プラン案内を出し、まだ認可へ進まない', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    const sheet = await screen.findByRole('dialog', { name: 'プランを選ぶ' });
    expect(startGoogleConnect).not.toHaveBeenCalled();
    // 購入は準備中で押せない
    expect(within(sheet).getByRole('button', { name: '予定反映(準備中)' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: '複数アカウント(準備中)' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: '無料で1つ接続する' })).toBeEnabled();
  });

  it('「無料で1つ接続する」でそのまま認可へ進み、次回は案内を出さない', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    const sheet = await screen.findByRole('dialog', { name: 'プランを選ぶ' });
    await user.click(within(sheet).getByRole('button', { name: '無料で1つ接続する' }));
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'プランを選ぶ' })).not.toBeInTheDocument();
    expect(localStorage.getItem(PLAN_SHEET_SEEN_KEY)).toBe('1');
  });

  it('一度閉じたら、次の「Google を接続」では案内を出さず直接認可へ', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    const sheet = await screen.findByRole('dialog', { name: 'プランを選ぶ' });
    await user.click(within(sheet).getByRole('button', { name: '下にスライドして閉じる' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'プランを選ぶ' })).not.toBeInTheDocument(),
    );
    expect(startGoogleConnect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Google を接続' }));
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'プランを選ぶ' })).not.toBeInTheDocument();
  });

  it('localStorage が使えなくても案内から無料で接続できる(例外を出さない)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    const sheet = await screen.findByRole('dialog', { name: 'プランを選ぶ' });
    await user.click(within(sheet).getByRole('button', { name: '無料で1つ接続する' }));
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
  });

  it('接続1件以上・複数アカウントの権利なし: 「Google アカウントを追加」で案内を出す(無料で続けるは無い)', async () => {
    localStorage.setItem(PLAN_SHEET_SEEN_KEY, '1'); // 初回案内を閉じていても、追加時は出す
    listConnections.mockResolvedValue(ok([connectedOne]));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google アカウントを追加' }));
    const sheet = await screen.findByRole('dialog', { name: 'プランを選ぶ' });
    expect(startGoogleConnect).not.toHaveBeenCalled();
    expect(within(sheet).queryByRole('button', { name: '無料で1つ接続する' })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '今はしない' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'プランを選ぶ' })).not.toBeInTheDocument(),
    );
    expect(startGoogleConnect).not.toHaveBeenCalled();
  });

  it('接続1件以上・複数アカウントの権利あり: 案内を出さず直接認可へ', async () => {
    entitlementsValue = { ...entitlementsValue, hasMultiAccount: true, canWrite: true };
    listConnections.mockResolvedValue(ok([connectedOne]));
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google アカウントを追加' }));
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'プランを選ぶ' })).not.toBeInTheDocument();
  });

  it('サーバーが上限超過(connection/limit-reached)を返したら文言を出す', async () => {
    entitlementsValue = { ...entitlementsValue, hasMultiAccount: true, canWrite: true };
    listConnections.mockResolvedValue(ok([connectedOne]));
    startGoogleConnect.mockResolvedValue(
      err(appError('connection/limit-reached', 'connection/limit-reached')),
    );
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(await screen.findByRole('button', { name: 'Google アカウントを追加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '接続できる Google アカウント数の上限に達しました',
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
