// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// 模擬するのは OS との境界(Capacitor のネイティブ橋)だけ。
const platform = vi.hoisted(() => ({ native: true }));
const nativePlugin = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  listAssets: vi.fn(),
  loadImage: vi.fn(),
  cancelLoads: vi.fn(async () => {}),
  cancelLoad: vi.fn(async () => {}),
  manageLimitedAccess: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
  registerPlugin: () => nativePlugin,
}));

import {
  cancelDevicePhotoPreview,
  checkDevicePhotoPermission,
  listDevicePhotosForDay,
  loadDevicePhotoPreview,
  loadDevicePhotoThumbnail,
  localDayRangeMs,
  releaseDevicePhotoCache,
  reselectLimitedDevicePhotos,
  requestDevicePhotoPermission,
} from './devicePhotos';

const originalTimeZone = process.env.TZ;
beforeEach(() => {
  process.env.TZ = 'Asia/Tokyo';
  platform.native = true;
  vi.clearAllMocks();
  nativePlugin.loadImage.mockReset();
  releaseDevicePhotoCache();
  nativePlugin.cancelLoads.mockClear();
});
afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

it('東京の2026年10月20日はUTCの前日15時から当日15時未満になる', () => {
  const { fromMs, toMs } = localDayRangeMs('2026-10-20');
  expect(new Date(fromMs).toISOString()).toBe('2026-10-19T15:00:00.000Z');
  expect(new Date(toMs).toISOString()).toBe('2026-10-20T15:00:00.000Z');
});

it('存在しない暦日は別日に丸めずに拒否する', () => {
  expect(() => localDayRangeMs('2026-02-30')).toThrow();
});

it('100年未満の暦年を1900年代へ置き換えない', () => {
  process.env.TZ = 'UTC';
  const range = localDayRangeMs('0099-12-31');
  expect(new Date(range.fromMs).toISOString()).toBe('0099-12-31T00:00:00.000Z');
  expect(new Date(range.toMs).toISOString()).toBe('0100-01-01T00:00:00.000Z');
});

it('日付変更線の変更で存在しないApiaの暦日を、翌日の写真に置き換えない', () => {
  process.env.TZ = 'Pacific/Apia';
  expect(() => localDayRangeMs('2011-12-30')).toThrow();
});

it('夏時間の切替日は23時間・25時間になり、固定24時間を足さない', () => {
  process.env.TZ = 'America/New_York';
  const spring = localDayRangeMs('2026-03-08');
  expect((spring.toMs - spring.fromMs) / 3_600_000).toBe(23);
  const fall = localDayRangeMs('2026-11-01');
  expect((fall.toMs - fall.fromMs) / 3_600_000).toBe(25);
});

it('深夜0時が存在しない夏時間開始日も、終端は翌日の0時にする', () => {
  process.env.TZ = 'America/Sao_Paulo';
  const range = localDayRangeMs('2018-11-04');
  expect(new Date(range.fromMs).toISOString()).toBe('2018-11-04T03:00:00.000Z');
  expect(new Date(range.toMs).toISOString()).toBe('2018-11-05T02:00:00.000Z');
});

it('一覧は当日範囲で40件ずつ要求し、範囲外の応答を混ぜず日時の昇順に並べる', async () => {
  const day = localDayRangeMs('2026-05-10');
  nativePlugin.listAssets.mockResolvedValue({
    assets: [
      { id: 'late', createdMs: day.toMs - 1 },
      { id: 'other', createdMs: day.toMs },
      { id: 'early', createdMs: day.fromMs },
    ],
    hasMore: true,
  });
  const page = await listDevicePhotosForDay('2026-05-10', 40);
  expect(nativePlugin.listAssets).toHaveBeenCalledWith({
    fromMs: day.fromMs,
    toMs: day.toMs,
    offset: 40,
    limit: 40,
  });
  expect(page.assets.map((a) => a.id)).toEqual(['early', 'late']);
  expect(page.hasMore).toBe(true);
});

it('Webでは写真機能は非対応で、権限要求も一覧取得もネイティブを呼ばない', async () => {
  platform.native = false;
  expect(await checkDevicePhotoPermission()).toBe('unavailable');
  expect(await requestDevicePhotoPermission()).toBe('unavailable');
  expect(await listDevicePhotosForDay('2026-05-10', 0)).toEqual({ assets: [], hasMore: false });
  expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
  expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
  expect(nativePlugin.listAssets).not.toHaveBeenCalled();
});

it('一部許可の選び直しはOSの選択画面を開いた後の権限を返し、Webでは何も呼ばない', async () => {
  nativePlugin.manageLimitedAccess.mockResolvedValue({ status: 'limited' });
  expect(await reselectLimitedDevicePhotos()).toBe('limited');
  expect(nativePlugin.manageLimitedAccess).toHaveBeenCalledTimes(1);
  platform.native = false;
  expect(await reselectLimitedDevicePhotos()).toBe('unavailable');
  expect(nativePlugin.manageLimitedAccess).toHaveBeenCalledTimes(1);
});

it('拡大の読込を途中でやめると、その1枚だけOSへ取消を頼み、遅れて届いた画像は捨てる', async () => {
  let finish: (value: { dataUrl: string }) => void = () => {};
  nativePlugin.loadImage.mockImplementation(
    () => new Promise((resolve) => { finish = resolve; }),
  );
  const pending = loadDevicePhotoPreview('big');
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(1));
  cancelDevicePhotoPreview('big');
  expect(nativePlugin.cancelLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'big', maxSide: 1600, requestId: expect.any(String) }));
  expect(nativePlugin.cancelLoads).not.toHaveBeenCalled();
  finish({ dataUrl: 'data:image/jpeg;base64,LATE' });
  expect(await pending).toBeNull();
});

it('縮小画像は長辺256px以下・クラウド取得なしで要求し、同じ画像は再取得しない', async () => {
  nativePlugin.loadImage.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,AAAA' });
  const first = await loadDevicePhotoThumbnail('asset-1');
  const second = await loadDevicePhotoThumbnail('asset-1');
  expect(first).toBe('data:image/jpeg;base64,AAAA');
  expect(second).toBe(first);
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(1);
  expect(nativePlugin.loadImage).toHaveBeenCalledWith(expect.objectContaining({
    id: 'asset-1',
    maxSide: 256,
    allowNetwork: false,
  }));
});

it('解放すると古い読込結果は捨ててキャッシュへ入れず、OS側の読込も取り消す', async () => {
  let resolveLoad: (value: { dataUrl: string }) => void = () => {};
  nativePlugin.loadImage.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLoad = resolve;
    }),
  );
  const pending = loadDevicePhotoThumbnail('stale');
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(1));
  releaseDevicePhotoCache();
  expect(nativePlugin.cancelLoads).toHaveBeenCalledTimes(1);
  resolveLoad({ dataUrl: 'data:image/jpeg;base64,OLD' });
  expect(await pending).toBeNull();
  nativePlugin.loadImage.mockResolvedValueOnce({ dataUrl: 'data:image/jpeg;base64,NEW' });
  expect(await loadDevicePhotoThumbnail('stale')).toBe('data:image/jpeg;base64,NEW');
});

it('縮小画像キャッシュは16MiBを超えて蓄積せず、古いものから捨てる', async () => {
  // UTF-16の上限で数えると、1件あたり約6MiBになる。
  const sixMiB = 'x'.repeat(3 * 1024 * 1024);
  nativePlugin.loadImage.mockImplementation(async ({ id }: { id: string }) => ({
    dataUrl: `${id}${sixMiB}`,
  }));
  await loadDevicePhotoThumbnail('a');
  await loadDevicePhotoThumbnail('b');
  await loadDevicePhotoThumbnail('c'); // 18MiB > 16MiB なので最も古い a が捨てられる
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(3);
  await loadDevicePhotoThumbnail('b');
  await loadDevicePhotoThumbnail('c');
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(3);
  await loadDevicePhotoThumbnail('a');
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(4);
});

it('文字列がUTF-16で保持されても16MiB以内になるよう、6Mi文字の画像は1枚まで保持する', async () => {
  nativePlugin.loadImage.mockResolvedValue({ dataUrl: 'x'.repeat(6 * 1024 * 1024) });
  await loadDevicePhotoThumbnail('a');
  await loadDevicePhotoThumbnail('b');
  await loadDevicePhotoThumbnail('a');
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(3);
});

it('縮小画像の同時生成は2件までに制限し、空きができたら順に進める', async () => {
  const finishers: (() => void)[] = [];
  nativePlugin.loadImage.mockImplementation(
    () => new Promise((resolve) => finishers.push(() => resolve({ dataUrl: 'data:image/jpeg;base64,Q' }))),
  );
  const loads = ['p1', 'p2', 'p3', 'p4'].map((id) => loadDevicePhotoThumbnail(id));
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2));
  finishers.shift()?.();
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(3));
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(3);
  while (finishers.length > 0) finishers.shift()?.();
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(4));
  while (finishers.length > 0) finishers.shift()?.();
  await Promise.all(loads);
});

it('拡大画像は長辺1600px以下で、キャッシュせず、個別に開く時だけOS経由の取得を許す', async () => {
  nativePlugin.loadImage.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,PREV' });
  expect(await loadDevicePhotoPreview('p')).toBe('data:image/jpeg;base64,PREV');
  expect(nativePlugin.loadImage).toHaveBeenCalledWith(expect.objectContaining({ id: 'p', maxSide: 1600, allowNetwork: true }));
  await loadDevicePhotoPreview('p');
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2);
});

it('解放時に順番待ちだった読込はOSへ依頼しない', async () => {
  const finishers: (() => void)[] = [];
  nativePlugin.loadImage.mockImplementation(
    () => new Promise((resolve) => finishers.push(() => resolve({ dataUrl: 'data:image/jpeg;base64,Q' }))),
  );
  const loads = ['p1', 'p2', 'p3'].map((id) => loadDevicePhotoThumbnail(id));
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2));
  releaseDevicePhotoCache();
  while (finishers.length > 0) finishers.shift()?.();
  expect(await Promise.all(loads)).toEqual([null, null, null]);
  expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2);
});

it('画面外へ出た縮小画像は順番待ちから取り除き、表示中の処理を待たずに取消が完了する', async () => {
  let finish: (value: { dataUrl: string }) => void = () => {};
  const blocked = new Promise<{ dataUrl: string }>(resolve => { finish = resolve; });
  nativePlugin.loadImage.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,NEXT' });
  nativePlugin.loadImage.mockReturnValueOnce(blocked).mockReturnValueOnce(blocked);
  const first = loadDevicePhotoThumbnail('visible-a');
  const second = loadDevicePhotoThumbnail('visible-b');
  await vi.waitFor(() => expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2));
  const controller = new AbortController();
  const queued = loadDevicePhotoThumbnail('offscreen', controller.signal);
  let settled = false;
  void queued.then(() => { settled = true; });
  controller.abort();
  try {
    await vi.waitFor(() => expect(settled).toBe(true));
    expect(await queued).toBeNull();
    expect(nativePlugin.loadImage).toHaveBeenCalledTimes(2);
  } finally {
    finish({ dataUrl: 'data:image/jpeg;base64,DONE' });
    await Promise.all([first, second, queued]);
  }
});
