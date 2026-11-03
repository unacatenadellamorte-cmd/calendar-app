import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEVICE_PHOTOS_ENABLED_STORAGE_KEY, resetDevicePhotosEnabledForTests } from '@/features/settings/model/useDevicePhotosEnabled';

// 月カレンダーの写真マーカー。製品の画面・設定・フックを使い、OS との境界(ネイティブ橋)だけを模擬する。
type Range = { fromMs: number; toMs: number };
const platform = vi.hoisted(() => ({ native: true }));
const appState = vi.hoisted(() => ({ listeners: new Set<(state: { isActive: boolean }) => void>() }));
const plugin = vi.hoisted(() => ({
  checkPermission: vi.fn(async () => ({ status: 'granted' })),
  requestPermission: vi.fn(async () => ({ status: 'granted' })),
  hasPhotosInRanges: vi.fn(),
  listAssets: vi.fn(async () => ({ assets: [], hasMore: false })),
  loadImage: vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,QQ==' })),
  cancelLoads: vi.fn(async () => {}),
  cancelLoad: vi.fn(async () => {}),
  cancelDayChecks: vi.fn(async () => {}),
  manageLimitedAccess: vi.fn(async () => ({ status: 'limited' })),
}));
vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => platform.native, getPlatform: () => (platform.native ? 'ios' : 'web') },
  registerPlugin: (name: string) => (name === 'DevicePhotos' ? plugin : {}),
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, listener: (state: { isActive: boolean }) => void) => {
      appState.listeners.add(listener);
      return { remove: async () => { appState.listeners.delete(listener); } };
    }),
  },
}));
vi.mock('@/app/AdBanner', () => ({ AdBanner: () => null }));
vi.mock('@/platform/layerBack', () => ({ registerLayerBack: () => () => {} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
const auth = vi.hoisted(() => ({ value: { state: 'authenticated', session: { user: { id: 'user-a' } } } as Record<string, unknown> }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => auth.value }));
vi.mock('@/features/calendars/model/useCalendars', () => ({
  useCalendars: () => ({ calendars: [], loading: false, errorKey: null, pendingDelete: null, dismissError: vi.fn() }),
}));
vi.mock('@/features/events/model/useEvents', () => ({
  useEvents: () => ({
    events: [], loading: false, errorKey: null, pendingDelete: null,
    create: vi.fn(), addLocal: vi.fn(), update: vi.fn(), remove: vi.fn(), setReminder: vi.fn(), undoDelete: vi.fn(), dismissError: vi.fn(),
  }),
}));
vi.mock('@/features/shifts/model/useShiftTemplates', () => ({
  useShiftTemplates: () => ({ templates: [], loading: false, errorKey: null }),
}));
vi.mock('@/app/secret-mode-context', () => ({ useSecretMode: () => ({ unlocked: false }) }));
const entitlement = vi.hoisted(() => ({ canViewPhotos: true, loading: false }));
vi.mock('@/features/billing/model/useEntitlements', () => ({ useEntitlements: () => ({ ...entitlement }) }));

const { CalendarScreen } = await import('./CalendarScreen');

/** 指定した日付(ローカル)の範囲に写真がある、という OS の応答を返す。 */
function photosOn(...dates: string[]) {
  return async ({ ranges }: { ranges: Range[] }) => ({
    hasPhotos: ranges.map(({ fromMs }) => {
      const d = new Date(fromMs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dates.includes(key);
    }),
  });
}
const markers = () => Array.from(document.querySelectorAll('[data-photo-marker]')).map((el) => el.getAttribute('data-photo-marker'));
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-08T00:00:00+09:00'));
  platform.native = true;
  entitlement.canViewPhotos = true;
  auth.value = { state: 'authenticated', session: { user: { id: 'user-a' } } };
  window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
  resetDevicePhotosEnabledForTests();
  plugin.checkPermission.mockReset().mockResolvedValue({ status: 'granted' });
  plugin.hasPhotosInRanges.mockReset().mockImplementation(photosOn('2026-09-08', '2026-09-20', '2026-08-31'));
  plugin.requestPermission.mockClear();
  plugin.cancelDayChecks.mockClear();
  plugin.cancelLoads.mockClear();
  appState.listeners.clear();
  setVisibility('visible');
});
afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('月カレンダーの写真マーカー', () => {
  it('写真がある日だけ、日付の右にカメラを出し、前後月の日も対象にする', async () => {
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toEqual(['2026-08-31', '2026-09-08', '2026-09-20']));
    const marker = document.querySelector('[data-photo-marker="2026-09-08"]')!;
    expect(marker).toHaveAccessibleName('写真');
    // 日付ボタンのすぐ右(同じ行)に置き、日付ボタンの名前は変えない。
    expect(marker.previousElementSibling).toBe(screen.getByRole('button', { name: '9月8日を開く' }));
    expect(screen.getByRole('button', { name: '9月8日を開く' })).not.toContainElement(marker as HTMLElement);
    expect(screen.getByRole('button', { name: '9月9日を開く' }).nextElementSibling).toBeNull();
    // 照会は表示グリッド全体を1回だけ。画像も識別子も扱わず、許可も求めない。
    expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(1);
    const { ranges } = plugin.hasPhotosInRanges.mock.calls[0]![0] as { ranges: Range[] };
    expect(ranges).toHaveLength(35);
    expect(ranges[0]!.fromMs).toBe(new Date(2026, 7, 30).getTime());
    expect(ranges.at(-1)!.toMs).toBe(new Date(2026, 9, 4).getTime());
    // 日の写真欄(別機能)以外に、マーカーのための画像一覧や読込はしない。
    for (const [arg] of plugin.listAssets.mock.calls as unknown as [Range][]) expect(arg.toMs - arg.fromMs).toBeLessThanOrEqual(25 * 3600_000);
    expect(plugin.requestPermission).not.toHaveBeenCalled();
  });

  it('月送りで新しい月を照会し、遅れて届いた前の月の応答は捨てる', async () => {
    let resolveFirst!: (value: { hasPhotos: boolean[] }) => void;
    plugin.hasPhotosInRanges.mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementation(photosOn('2026-10-12'));
    render(<CalendarScreen />);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(markers()).toEqual(['2026-10-12']));
    await act(async () => { resolveFirst({ hasPhotos: Array<boolean>(35).fill(true) }); });
    expect(markers()).toEqual(['2026-10-12']);
  });

  it('月送りの最初の描画から前の月のマーカーを隠す', async () => {
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    let resolveNext!: (value: { hasPhotos: boolean[] }) => void;
    plugin.hasPhotosInRanges.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(markers()).toEqual([]);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(2));
    await act(async () => { resolveNext({ hasPhotos: [] }); });
    expect(markers()).toEqual([]);
  });

  it.each(['prompt', 'denied', 'unavailable'])('許可が%sなら照会せず、ダイアログも出さない', async (status) => {
    plugin.checkPermission.mockResolvedValue({ status });
    render(<CalendarScreen />);
    await waitFor(() => expect(plugin.checkPermission).toHaveBeenCalled());
    await act(async () => {});
    expect(plugin.hasPhotosInRanges).not.toHaveBeenCalled();
    expect(plugin.requestPermission).not.toHaveBeenCalled();
    expect(markers()).toEqual([]);
  });

  it('一部許可(limited)でも照会して表示する', async () => {
    plugin.checkPermission.mockResolvedValue({ status: 'limited' });
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
  });

  it('照会が失敗・応答が不正ならマーカーを出さない', async () => {
    plugin.hasPhotosInRanges.mockReset().mockRejectedValue(new Error('unavailable'));
    const first = render(<CalendarScreen />);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalled());
    await act(async () => {});
    expect(markers()).toEqual([]);
    first.unmount();
    plugin.hasPhotosInRanges.mockReset().mockResolvedValue({ hasPhotos: [true] });
    render(<CalendarScreen />);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalled());
    await act(async () => {});
    expect(markers()).toEqual([]);
  });

  it('設定OFF・無権利・Webでは写真APIを一切呼ばず、マーカーも出さない', async () => {
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'false');
    resetDevicePhotosEnabledForTests();
    const off = render(<CalendarScreen />);
    await act(async () => {});
    off.unmount();
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    resetDevicePhotosEnabledForTests();
    entitlement.canViewPhotos = false;
    const free = render(<CalendarScreen />);
    await act(async () => {});
    free.unmount();
    entitlement.canViewPhotos = true;
    platform.native = false;
    render(<CalendarScreen />);
    await act(async () => {});
    expect(plugin.checkPermission).not.toHaveBeenCalled();
    expect(plugin.hasPhotosInRanges).not.toHaveBeenCalled();
    expect(markers()).toEqual([]);
  });

  it('権利が失効したら直ちに隠し、有効に戻れば読み直す', async () => {
    const view = render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    entitlement.canViewPhotos = false;
    view.rerender(<CalendarScreen />);
    expect(markers()).toEqual([]);
    entitlement.canViewPhotos = true;
    view.rerender(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(2);
  });

  it('利用者が変わったら前の利用者の結果を隠して読み直す', async () => {
    const view = render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    plugin.hasPhotosInRanges.mockImplementationOnce(() => new Promise(() => {}));
    auth.value = { state: 'authenticated', session: { user: { id: 'user-b' } } };
    view.rerender(<CalendarScreen />);
    // 日の写真欄の非同期更新を待つ前に、前の利用者の印が隠れることを確認する。
    expect(markers()).toEqual([]);
    await act(async () => {});
  });

  it('背面へ回ると隠し、前面へ戻ると読み直す(画面の可視状態とアプリの前面状態の両方)', async () => {
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    act(() => setVisibility('hidden'));
    expect(markers()).toEqual([]);
    plugin.hasPhotosInRanges.mockImplementation(photosOn('2026-09-21'));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(markers()).toEqual(['2026-09-21']));

    act(() => appState.listeners.forEach((listener) => listener({ isActive: false })));
    expect(markers()).toEqual([]);
    act(() => appState.listeners.forEach((listener) => listener({ isActive: true })));
    await waitFor(() => expect(markers()).toEqual(['2026-09-21']));
  });

  it('復帰時に許可が取り消されていれば表示しない', async () => {
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    act(() => appState.listeners.forEach((listener) => listener({ isActive: false })));
    plugin.checkPermission.mockResolvedValue({ status: 'denied' });
    act(() => appState.listeners.forEach((listener) => listener({ isActive: true })));
    await act(async () => {});
    expect(markers()).toEqual([]);
  });

  it('日付のタップ・ダブルタップは従来どおり動き、日の写真の読込取消がマーカーを消さない', async () => {
    plugin.listAssets.mockResolvedValue({ assets: [{ id: 'qa', createdMs: new Date(2026, 8, 8, 10).getTime() }], hasMore: false } as never);
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: '9月8日を開く' }));
    await screen.findByRole('button', { name: /の写真を拡大/ });
    // 週に折りたたまれた帯にも、その週の写真ありの日が出続ける。
    expect(markers()).toContain('2026-09-08');
    expect(plugin.cancelLoads).toHaveBeenCalled();
    expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(1);
  });

  it('月以外のビューでは照会しない', async () => {
    render(<CalendarScreen />);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('radio', { name: '年' }));
    expect(markers()).toEqual([]);
    expect(document.querySelectorAll('[data-photo-marker]')).toHaveLength(0);
  });

  it('日写真欄で許可を完了すると、OSの前後通知が無くてもマーカーを読み直す', async () => {
    plugin.checkPermission.mockResolvedValue({ status: 'prompt' });
    render(<CalendarScreen />);
    await screen.findByRole('button', { name: '写真へのアクセスを許可' });
    expect(markers()).toEqual([]);
    expect(plugin.hasPhotosInRanges).not.toHaveBeenCalled();
    plugin.requestPermission.mockImplementation(async () => {
      plugin.checkPermission.mockResolvedValue({ status: 'granted' });
      return { status: 'granted' };
    });
    fireEvent.click(screen.getByRole('button', { name: '写真へのアクセスを許可' }));
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    expect(appState.listeners.size).toBeGreaterThan(0);
  });

  it('日写真欄で一部許可の写真を選び直すと、マーカーを読み直す', async () => {
    plugin.checkPermission.mockResolvedValue({ status: 'limited' });
    render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    plugin.hasPhotosInRanges.mockImplementation(photosOn('2026-09-15'));
    fireEvent.click(await screen.findByRole('button', { name: '表示する写真を選び直す' }));
    await waitFor(() => expect(markers()).toEqual(['2026-09-15']));
  });

  it('月送りで未完了の照会だけを専用に取り消し、画像読込の一括取消は使わない', async () => {
    plugin.hasPhotosInRanges.mockReset().mockImplementation(() => new Promise(() => {}));
    render(<CalendarScreen />);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(1));
    plugin.cancelLoads.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(plugin.cancelDayChecks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(2));
    // 日の写真欄(別機能)も日付変更で取り消すが、それは従来どおりで月の照会とは別経路。
    // 完了済みの照会では専用取消を呼ばない。
    plugin.hasPhotosInRanges.mockReset().mockImplementation(photosOn('2026-11-02'));
    plugin.cancelDayChecks.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(markers()).toEqual(['2026-11-02']));
    plugin.cancelDayChecks.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(2));
    expect(plugin.cancelDayChecks).not.toHaveBeenCalled();
  });

  it('背景化で未完了の照会を取り消す', async () => {
    plugin.hasPhotosInRanges.mockReset().mockImplementation(() => new Promise(() => {}));
    render(<CalendarScreen />);
    await waitFor(() => expect(plugin.hasPhotosInRanges).toHaveBeenCalledTimes(1));
    act(() => setVisibility('hidden'));
    expect(plugin.cancelDayChecks).toHaveBeenCalledTimes(1);
  });

  it('権利失効と月送りが同時でも、退出アニメーションの複製に古いマーカーを残さない', async () => {
    const view = render(<CalendarScreen />);
    await waitFor(() => expect(markers()).toContain('2026-09-08'));
    entitlement.canViewPhotos = false;
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    view.rerender(<CalendarScreen />);
    expect(markers()).toEqual([]);
    expect(document.querySelector('.month-page-exit [data-photo-marker]')).toBeNull();
  });
});
