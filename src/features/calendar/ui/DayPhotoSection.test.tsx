import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 模擬するのは OS との境界(Capacitor のネイティブ橋)だけ。設定・フック・画面は本物を使う。
const platform = vi.hoisted(() => ({ native: true }));
const appState = vi.hoisted(() => ({ listener: undefined as undefined | ((state: { isActive: boolean }) => void) }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (_name, listener) => {
    appState.listener = listener;
    return { remove: async () => { appState.listener = undefined; } };
  }),
} }));
const nativePlugin = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  listAssets: vi.fn(),
  loadImage: vi.fn(),
  cancelLoads: vi.fn(async () => {}),
  cancelLoad: vi.fn<(options: { requestId: string }) => Promise<void>>(async () => {}),
  manageLimitedAccess: vi.fn(),
}));
vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => (platform.native ? 'ios' : 'web'),
  },
  registerPlugin: (name: string) => (name === 'DevicePhotos' ? nativePlugin : {}),
}));

import { releaseDevicePhotoCache } from '@/platform/devicePhotos';
import {
  DEVICE_PHOTOS_ENABLED_STORAGE_KEY,
  resetDevicePhotosEnabledForTests,
  useDevicePhotosEnabled,
} from '@/features/settings/model/useDevicePhotosEnabled';
import { DayPhotoSection } from './DayPhotoSection';

const DAY = '2026-10-20';
const originalTimeZone = process.env.TZ;
// 東京の2026-10-20 09:05(UTC 00:05)。
const MORNING = Date.UTC(2026, 9, 20, 0, 5);

function enableSetting() {
  window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
  resetDevicePhotosEnabledForTests();
}

function photo(id: string, createdMs = MORNING) {
  return { id, createdMs };
}

function givenPermission(status: string, assets = [photo('a')], hasMore = false) {
  nativePlugin.checkPermission.mockResolvedValue({ status });
  nativePlugin.requestPermission.mockResolvedValue({ status });
  nativePlugin.listAssets.mockResolvedValue({ assets, hasMore });
  nativePlugin.loadImage.mockImplementation(async ({ id }: { id: string }) => ({
    dataUrl: `data:image/jpeg;base64,${id}`,
  }));
}

beforeEach(() => {
  process.env.TZ = 'Asia/Tokyo';
  platform.native = true;
  window.localStorage.clear();
  resetDevicePhotosEnabledForTests();
  vi.clearAllMocks();
  nativePlugin.loadImage.mockReset();
  nativePlugin.listAssets.mockReset();
  releaseDevicePhotoCache();
  nativePlugin.cancelLoads.mockClear();
});
afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe('DayPhotoSection', () => {
  it('設定がOFF(既定)なら何も描画せず、写真APIも一切呼ばない', async () => {
    render(<DayPhotoSection date={DAY} />);
    expect(screen.queryByRole('button', { name: /写真/ })).not.toBeInTheDocument();
    await act(async () => {});
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
    expect(nativePlugin.loadImage).not.toHaveBeenCalled();
  });

  it('設定がONでも写真欄は折りたたまれ、開くまで権限の確認も要求もしない', async () => {
    enableSetting();
    render(<DayPhotoSection date={DAY} />);
    expect(screen.getByRole('button', { name: 'この日の写真' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await act(async () => {});
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
  });

  it('許可済みで開くと当日の写真を撮影順に表示し、OSの権限ダイアログは出さない', async () => {
    enableSetting();
    givenPermission('granted', [photo('a'), photo('b', MORNING + 60_000)]);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    const tiles = await screen.findAllByRole('button', { name: /の写真を拡大/ });
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      '9:05 の写真を拡大',
      '9:06 の写真を拡大',
    ]);
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).toHaveBeenCalledWith({
      fromMs: Date.UTC(2026, 9, 19, 15),
      toMs: Date.UTC(2026, 9, 20, 15),
      offset: 0,
      limit: 40,
    });
    await waitFor(() => expect(document.querySelectorAll('img[src^="data:"]')).toHaveLength(2));
  });

  it('未要求なら写真を読まず、利用者がボタンを押した時だけOSに許可を求める', async () => {
    enableSetting();
    givenPermission('prompt');
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    const allow = await screen.findByRole('button', { name: '写真へのアクセスを許可' });
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
    nativePlugin.requestPermission.mockResolvedValue({ status: 'granted' });
    await user.click(allow);
    expect(nativePlugin.requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /の写真を拡大/ })).toBeInTheDocument();
  });

  it('拒否されていたら写真を読まず設定アプリを案内し、許可し直した後は再確認で表示できる', async () => {
    enableSetting();
    givenPermission('denied');
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    expect(
      await screen.findByText(/端末の設定アプリで、このアプリの写真へのアクセスを許可してください/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '写真へのアクセスを許可' })).not.toBeInTheDocument();
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
    nativePlugin.checkPermission.mockResolvedValue({ status: 'granted' });
    await user.click(screen.getByRole('button', { name: 'もう一度確認' }));
    expect(await screen.findByRole('button', { name: /の写真を拡大/ })).toBeInTheDocument();
  });
});

describe('DayPhotoSection 一部許可', () => {
  it('選び直しをOSが開けなかった場合もエラー表示から再試行できる', async () => {
    enableSetting();
    givenPermission('limited');
    nativePlugin.manageLimitedAccess.mockRejectedValueOnce(new Error('開けません'));
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await user.click(await screen.findByRole('button', { name: '表示する写真を選び直す' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('写真を読み込めませんでした。');
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('button', { name: /の写真を拡大/ })).toBeInTheDocument();
  });
  it('一部許可を明記し、選び直した後は新しい許可範囲で読み直す', async () => {
    enableSetting();
    givenPermission('limited', [photo('a')]);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    expect(await screen.findByText('一部の写真だけが許可されています。')).toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: /の写真を拡大/ })).toHaveLength(1);
    nativePlugin.manageLimitedAccess.mockResolvedValue({ status: 'limited' });
    nativePlugin.listAssets.mockResolvedValue({
      assets: [photo('a'), photo('b', MORNING + 60_000)],
      hasMore: false,
    });
    await user.click(screen.getByRole('button', { name: '表示する写真を選び直す' }));
    expect(nativePlugin.manageLimitedAccess).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /の写真を拡大/ })).toHaveLength(2),
    );
  });
});

describe('DayPhotoSection 0件と失敗', () => {
  it('続き取得だけ失敗しても既存写真を残し、同じ取得位置から再試行できる', async () => {
    enableSetting();
    givenPermission('granted', Array.from({ length: 40 }, (_, i) => photo(`p${i}`, MORNING + i * 60000)), true);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    const more = await screen.findByRole('button', { name: 'さらに読み込む' });
    nativePlugin.listAssets.mockRejectedValueOnce(new Error('続き取得失敗'));
    await user.click(more);
    expect(await screen.findByRole('alert')).toHaveTextContent('写真を読み込めませんでした。');
    expect(screen.getByRole('button', { name: '9:05 の写真を拡大' })).toBeInTheDocument();
    expect(more).toBeEnabled();
    nativePlugin.listAssets.mockResolvedValueOnce({ assets: [photo('last', MORNING + 50 * 60000)], hasMore: false });
    await user.click(more);
    expect(nativePlugin.listAssets.mock.calls.slice(1).map(([options]) => options.offset)).toEqual([40, 40]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'さらに読み込む' })).not.toBeInTheDocument();
    fireEvent.scroll(screen.getByRole('list'), { target: { scrollTop: 100000 } });
    expect(await screen.findByRole('button', { name: '9:55 の写真を拡大' })).toBeInTheDocument();
  });
  it('一覧の取得中は空欄にせず読み込み中と伝える', async () => {
    enableSetting();
    givenPermission('granted');
    nativePlugin.listAssets.mockReturnValue(new Promise(() => {}));
    render(<DayPhotoSection date={DAY} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'この日の写真' }));
    expect(await screen.findByRole('status')).toHaveTextContent('読み込み中…');
    expect(screen.queryByText('この日に撮影した写真はありません。')).not.toBeInTheDocument();
  });
  it('OS機能が利用不可なら読み込み待ちのままにせずエラーと再試行を表示する', async () => {
    enableSetting();
    givenPermission('unavailable');
    render(<DayPhotoSection date={DAY} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'この日の写真' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('写真を読み込めませんでした。');
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
  });
  it('0件は空の案内を出し、エラーとは区別する', async () => {
    enableSetting();
    givenPermission('granted', []);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    expect(await screen.findByText('この日に撮影した写真はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('読取失敗はエラーとして表示し、再試行で一覧を取り直せる', async () => {
    enableSetting();
    givenPermission('granted');
    nativePlugin.listAssets.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('写真を読み込めませんでした。');
    expect(screen.queryByText('この日に撮影した写真はありません。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('button', { name: /の写真を拡大/ })).toBeInTheDocument();
  });
});

describe('DayPhotoSection 競合と解放', () => {
  it('スクロールで消えたタイルの待機要求を捨て、いま表示する写真を先に取得する', async () => {
    enableSetting();
    givenPermission('granted', Array.from({ length: 40 }, (_, i) => photo(`p${i}`, MORNING + i * 60000)));
    const jobs = new Map<string, { resolve: (v: { dataUrl: string }) => void; reject: (e: Error) => void }>();
    nativePlugin.loadImage.mockImplementation(({ requestId }: { requestId: string }) => new Promise((resolve, reject) => { jobs.set(requestId, { resolve, reject }); }));
    nativePlugin.cancelLoad.mockImplementation(async ({ requestId }: { requestId: string }) => { jobs.get(requestId)?.reject(new Error('取消')); });
    let unmount = () => {};
    try {
      unmount = render(<DayPhotoSection date={DAY} />).unmount;
      await userEvent.setup().click(screen.getByRole('button', { name: 'この日の写真' }));
      await waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2));
      fireEvent.scroll(screen.getByRole('list'), { target: { scrollTop: 100000 } });
      await waitFor(() => expect(nativePlugin.loadImage.mock.calls.some(([options]) => options.id === 'p36')).toBe(true));
      expect(nativePlugin.loadImage.mock.calls.some(([options]) => options.id === 'p2')).toBe(false);
    } finally {
      unmount();
      for (const job of jobs.values()) job.resolve({ dataUrl: 'data:image/jpeg;base64,Q' });
      await act(async () => {});
      nativePlugin.cancelLoad.mockImplementation(async () => {});
    }
  });
  it('日付を変えた描画の時点で前日の画像を残さない', async () => {
    enableSetting();
    givenPermission('granted');
    const observations: number[] = [];
    function CalendarDate({ date }: { date: string }) {
      useLayoutEffect(() => { observations.push(document.images.length); }, [date]);
      return <DayPhotoSection date={date} />;
    }
    const { rerender } = render(<CalendarDate date={DAY} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'この日の写真' }));
    await waitFor(() => expect(document.images.length).toBe(1));
    nativePlugin.listAssets.mockReturnValue(new Promise(() => {}));
    rerender(<CalendarDate date="2026-10-21" />);
    expect(observations.at(-1)).toBe(0);
  });
  it('日時不正の画像を除外しても取得位置は元の40件分だけ進み、次ページを取りこぼさない', async () => {
    enableSetting();
    const first = Array.from({ length: 40 }, (_, i) => photo(`p${i}`, MORNING + i * 60_000));
    first[0] = photo('other-day', MORNING - 86_400_000);
    givenPermission('granted', first, true);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await screen.findByRole('button', { name: 'さらに読み込む' });
    nativePlugin.listAssets.mockResolvedValue({ assets: [photo('last', MORNING + 50 * 60_000)], hasMore: false });
    await user.click(screen.getByRole('button', { name: 'さらに読み込む' }));
    expect(nativePlugin.listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 40 }));
  });
  it('ネイティブの背面通知で拡大写真も解放し、権限撤回後の復帰で再表示しない', async () => {
    enableSetting();
    givenPermission('granted');
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await user.click(await screen.findByRole('button', { name: '9:05 の写真を拡大' }));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: '写真' })).getByRole('img')).toBeInTheDocument());
    nativePlugin.checkPermission.mockResolvedValue({ status: 'denied' });
    await act(async () => { appState.listener?.({ isActive: false }); });
    expect(screen.queryByRole('dialog', { name: '写真' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    await act(async () => { appState.listener?.({ isActive: true }); });
    expect(await screen.findByText(/端末の設定アプリで/)).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
  it('利用者が切り替わったら前の利用者の画像を解放して読み直す', async () => {
    enableSetting();
    givenPermission('granted');
    const user = userEvent.setup();
    const view = (userId: string) => (
      <DayPhotoSection date={DAY} userId={userId} />
    );
    const { rerender } = render(view('u1'));
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await screen.findByRole('button', { name: '9:05 の写真を拡大' });
    nativePlugin.cancelLoads.mockClear();
    nativePlugin.checkPermission.mockClear();
    rerender(view('u2'));
    expect(nativePlugin.cancelLoads).toHaveBeenCalled();
    await waitFor(() => expect(nativePlugin.checkPermission).toHaveBeenCalledTimes(1));
  });

  it('背面へ回ると画像を解放し、復帰時に権限を再確認して撤回後は写真を出さない', async () => {
    enableSetting();
    givenPermission('granted');
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await screen.findByRole('button', { name: '9:05 の写真を拡大' });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    nativePlugin.cancelLoads.mockClear();
    visibility.mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(nativePlugin.cancelLoads).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /の写真を拡大/ })).not.toBeInTheDocument();
    nativePlugin.checkPermission.mockResolvedValue({ status: 'denied' });
    nativePlugin.listAssets.mockClear();
    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText(/端末の設定アプリで/)).toBeInTheDocument();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /の写真を拡大/ })).not.toBeInTheDocument();
    visibility.mockRestore();
  });

  it('拡大の読込中に閉じたら、その1枚だけ取り消して遅れて届いた画像を表示しない', async () => {
    enableSetting();
    givenPermission('granted');
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    const tile = await screen.findByRole('button', { name: '9:05 の写真を拡大' });
    await waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(1));
    let finish: (value: { dataUrl: string }) => void = () => {};
    nativePlugin.loadImage.mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    nativePlugin.cancelLoads.mockClear();
    await user.click(tile);
    await waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(nativePlugin.cancelLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', maxSide: 1600, requestId: expect.any(String) }));
    expect(nativePlugin.cancelLoads).not.toHaveBeenCalled();
    await act(async () => {
      finish({ dataUrl: 'data:image/jpeg;base64,LATE' });
    });
    expect(document.querySelector('img[src$="LATE"]')).toBeNull();
  });

  it('OSが提供できない画像は、拡大表示で取得できなかったことを案内する', async () => {
    enableSetting();
    givenPermission('granted');
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    const tile = await screen.findByRole('button', { name: '9:05 の写真を拡大' });
    nativePlugin.loadImage.mockRejectedValue(new Error('unavailable'));
    await user.click(tile);
    const dialog = await screen.findByRole('dialog', { name: '写真' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'この写真は端末のOSから取得できませんでした(クラウド上の写真など)。',
    );
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
  });

  it('写真を開くと1枚だけ拡大表示し(長辺1600px・個別取得のみ許可)、閉じると画像を解放する', async () => {
    enableSetting();
    givenPermission('granted', [photo('a'), photo('b', MORNING + 60_000)]);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await user.click(await screen.findByRole('button', { name: '9:06 の写真を拡大' }));
    const dialog = await screen.findByRole('dialog', { name: '写真' });
    expect(nativePlugin.loadImage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'b',
      maxSide: 1600,
      allowNetwork: true,
    }));
    expect(
      await within(dialog).findByRole('img', { name: '9:06 に撮影した写真' }),
    ).toHaveAttribute('src', 'data:image/jpeg;base64,b');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '9:06 に撮影した写真' })).not.toBeInTheDocument();
  });

  it('大量の写真でも表示範囲の分だけ描画・縮小画像の読込を行い、スクロールで順に到達できる', async () => {
    enableSetting();
    const many = Array.from({ length: 40 }, (_, i) => photo(`p${i}`, MORNING + i * 60_000));
    givenPermission('granted', many);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await screen.findByRole('button', { name: '9:05 の写真を拡大' });
    const rendered = screen.getAllByRole('button', { name: /の写真を拡大/ }).length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(40);
    await waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(rendered));
    expect(screen.queryByRole('button', { name: '9:44 の写真を拡大' })).not.toBeInTheDocument();
    fireEvent.scroll(screen.getByRole('list', { name: '撮影した写真の一覧' }), {
      target: { scrollTop: 100_000 },
    });
    expect(await screen.findByRole('button', { name: '9:44 の写真を拡大' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9:05 の写真を拡大' })).not.toBeInTheDocument();
  });

  it('40件ずつ取得し、続きの読み込みで全件へ順に到達できる(重複は表示しない)', async () => {
    enableSetting();
    const first = Array.from({ length: 40 }, (_, i) => photo(`p${i}`, MORNING + i * 60_000));
    givenPermission('granted', first, true);
    const user = userEvent.setup();
    render(<DayPhotoSection date={DAY} />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await screen.findByRole('button', { name: '9:05 の写真を拡大' });
    nativePlugin.listAssets.mockResolvedValue({
      assets: [photo('p39', MORNING + 39 * 60_000), photo('p40', MORNING + 40 * 60_000)],
      hasMore: false,
    });
    await user.click(screen.getByRole('button', { name: 'さらに読み込む' }));
    expect(nativePlugin.listAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 40, limit: 40 }),
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: 'さらに読み込む' })).toBeNull());
    fireEvent.scroll(screen.getByRole('list', { name: '撮影した写真の一覧' }), {
      target: { scrollTop: 9 * 84 },
    });
    expect(await screen.findByRole('button', { name: '9:45 の写真を拡大' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '9:44 の写真を拡大' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'さらに読み込む' })).not.toBeInTheDocument();
  });

  it('表示中にOFFにすると写真と要求を即解放し、ONへ戻しても勝手に開き直さない', async () => {
    enableSetting();
    givenPermission('granted');
    function Harness() {
      const { setDevicePhotosEnabled } = useDevicePhotosEnabled();
      return (
        <>
          <button type="button" onClick={() => setDevicePhotosEnabled(false)}>
            スイッチOFF
          </button>
          <button type="button" onClick={() => setDevicePhotosEnabled(true)}>
            スイッチON
          </button>
          <DayPhotoSection date={DAY} />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await screen.findByRole('button', { name: /の写真を拡大/ });
    nativePlugin.cancelLoads.mockClear();
    nativePlugin.checkPermission.mockClear();
    await user.click(screen.getByRole('button', { name: 'スイッチOFF' }));
    expect(nativePlugin.cancelLoads).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'この日の写真' })).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'スイッチON' }));
    expect(screen.getByRole('button', { name: 'この日の写真' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await act(async () => {});
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
  });

  it('日付を変えた後に遅れて返った前日の応答は、表示を上書きせず捨てる', async () => {
    enableSetting();
    givenPermission('granted');
    let resolveOld: (page: unknown) => void = () => {};
    nativePlugin.listAssets.mockImplementationOnce(
      () => new Promise((resolve) => { resolveOld = resolve; }),
    );
    const user = userEvent.setup();
    const { rerender } = render(<DayPhotoSection date="2026-10-19" />);
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await waitFor(() => expect(nativePlugin.listAssets).toHaveBeenCalledTimes(1));
    nativePlugin.listAssets.mockResolvedValue({
      assets: [photo('new', MORNING + 5 * 60_000)],
      hasMore: false,
    });
    rerender(<DayPhotoSection date="2026-10-20" />);
    expect(await screen.findByRole('button', { name: '9:10 の写真を拡大' })).toBeInTheDocument();
    await act(async () => {
      resolveOld({ assets: [photo('old', MORNING - 86_400_000)], hasMore: false });
    });
    expect(screen.queryByRole('button', { name: '9:05 の写真を拡大' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /の写真を拡大/ })).toHaveLength(1);
    expect(nativePlugin.cancelLoads).toHaveBeenCalled();
  });
});
