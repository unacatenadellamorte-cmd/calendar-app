import { Capacitor, registerPlugin } from '@capacitor/core';
import { isValidLocalDate } from '@/lib/datetime';

/**
 * 端末の写真(OS の写真ライブラリ)を、選択日の撮影日時で読むネイティブブリッジ。
 * 画像は読み取り専用。写真・識別子・日時をサーバー・ログ・JSON へ渡さない。
 */

/** 'limited' は一部の写真だけを許可した状態(iOS の限定アクセス / Android の選択した写真)。 */
export type DevicePhotoPermission = 'prompt' | 'granted' | 'limited' | 'denied' | 'unavailable';

export interface DevicePhotoAsset {
  /** OS の識別子。画面外へ出さない(ログ・外部送信禁止)。 */
  id: string;
  /** 撮影日時(ms epoch)。日時不明の画像はネイティブ側で除外済み。 */
  createdMs: number;
}

export interface DevicePhotoPage {
  assets: DevicePhotoAsset[];
  hasMore: boolean;
  /** 除外・重複排除前のOS応答に基づく次の取得位置。 */
  nextOffset?: number;
}

export const DEVICE_PHOTO_PAGE_SIZE = 40;
export const DEVICE_PHOTO_THUMBNAIL_MAX_SIDE = 256;
export const DEVICE_PHOTO_THUMBNAIL_CACHE_BYTES = 16 * 1024 * 1024;
export const DEVICE_PHOTO_CONCURRENCY = 2;
export const DEVICE_PHOTO_PREVIEW_MAX_SIDE = 1600;

interface DevicePhotosPlugin {
  checkPermission(): Promise<{ status: DevicePhotoPermission }>;
  requestPermission(): Promise<{ status: DevicePhotoPermission }>;
  listAssets(options: {
    fromMs: number;
    toMs: number;
    offset: number;
    limit: number;
  }): Promise<DevicePhotoPage>;
  loadImage(options: {
    id: string;
    maxSide: number;
    allowNetwork: boolean;
    requestId: string;
  }): Promise<{ dataUrl: string }>;
  /** 実行中・待機中の画像読込をすべて取り消す(OS 側のリクエストも解放する)。 */
  cancelLoads(): Promise<void>;
  /** 指定した1枚の画像読込だけを取り消す。 */
  cancelLoad(options: { id: string; maxSide: number; requestId: string }): Promise<void>;
  /** 一部許可の選択画面を開く(iOS の限定ライブラリ選択 / Android の選択写真の選び直し)。 */
  manageLimitedAccess(): Promise<{ status: DevicePhotoPermission }>;
}

const DevicePhotos = registerPlugin<DevicePhotosPlugin>('DevicePhotos');

/** ネイティブ(iOS / Android)として動いているか。Web ではこの機能自体を出さない。 */
export function isDevicePhotosSupported(): boolean {
  return Capacitor.isNativePlatform();
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 選択日(YYYY-MM-DD、端末のローカル日付)の範囲を ms epoch で返す。
 * 終端は「翌日0時」をローカル日付計算で求める(固定24時間を足さない、夏時間に追従)。
 */
export function localDayRangeMs(date: string): { fromMs: number; toMs: number } {
  const match = DATE_PATTERN.exec(date);
  if (!match || !isValidLocalDate(date)) throw new Error('日付が不正です。');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(0);
  start.setFullYear(year, month - 1, day);
  start.setHours(0, 0, 0, 0);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    throw new Error('この時間帯では存在しない日付です。');
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return {
    fromMs: start.getTime(),
    toMs: end.getTime(),
  };
}

/** 権限の状態を確認する(OS の要求ダイアログは出さない)。 */
export async function checkDevicePhotoPermission(): Promise<DevicePhotoPermission> {
  if (!isDevicePhotosSupported()) return 'unavailable';
  const { status } = await DevicePhotos.checkPermission();
  return status;
}

/** OS の権限ダイアログを出す。利用者が写真欄で操作した時だけ呼ぶ。 */
export async function requestDevicePhotoPermission(): Promise<DevicePhotoPermission> {
  if (!isDevicePhotosSupported()) return 'unavailable';
  const { status } = await DevicePhotos.requestPermission();
  return status;
}

/** 一部許可のとき、OS の選択画面で見せる写真を選び直す。利用者が操作した時だけ呼ぶ。 */
export async function reselectLimitedDevicePhotos(): Promise<DevicePhotoPermission> {
  if (!isDevicePhotosSupported()) return 'unavailable';
  const { status } = await DevicePhotos.manageLimitedAccess();
  return status;
}

/**
 * 選択日に撮影された画像を1ページ(最大40件)取得する。日時の昇順。
 * ネイティブ応答も範囲で再確認し、当日外の画像を混ぜない。
 */
export async function listDevicePhotosForDay(date: string, offset: number): Promise<DevicePhotoPage> {
  if (!isDevicePhotosSupported()) return { assets: [], hasMore: false };
  const { fromMs, toMs } = localDayRangeMs(date);
  const page = await DevicePhotos.listAssets({ fromMs, toMs, offset, limit: DEVICE_PHOTO_PAGE_SIZE });
  const assets = page.assets
    .filter((asset) => asset.createdMs >= fromMs && asset.createdMs < toMs)
    .sort((a, b) => a.createdMs - b.createdMs);
  return { assets, hasMore: page.hasMore, nextOffset: offset + page.assets.length };
}

// 縮小画像はメモリ上にだけ置く(ディスクへは保存しない)。
const thumbnailCache = new Map<string, string>();
// エンジンの1バイト文字列最適化に依存せず、UTF-16の上限で保守的に数える。
let thumbnailCacheBytes = 0;

function cacheThumbnail(id: string, dataUrl: string): void {
  if (dataUrl.length * 2 > DEVICE_PHOTO_THUMBNAIL_CACHE_BYTES) return;
  const previous = thumbnailCache.get(id);
  if (previous !== undefined) thumbnailCacheBytes -= previous.length * 2;
  thumbnailCache.set(id, dataUrl);
  thumbnailCacheBytes += dataUrl.length * 2;
  for (const [oldestId, oldest] of thumbnailCache) {
    if (thumbnailCacheBytes <= DEVICE_PHOTO_THUMBNAIL_CACHE_BYTES) break;
    thumbnailCache.delete(oldestId);
    thumbnailCacheBytes -= oldest.length * 2;
  }
}
// 解放のたびに進める世代番号。古い世代で始まった読込の結果は捨てる。
let generation = 0;
// 読込中の拡大表示。同じ画像は同時に1件だけ。
const previewTokens = new Map<string, LoadToken>();
const loadTokens = new Set<LoadToken>();
let requestSequence = 0;

// 同時に OS へ画像生成を頼む件数の上限。待機分は先着順に空きへ入る。
let running = 0;
const waiting: (() => void)[] = [];

function acquireSlot(token: LoadToken): Promise<boolean> {
  if (token.cancelled) return Promise.resolve(false);
  if (running < DEVICE_PHOTO_CONCURRENCY) {
    running += 1;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const start = () => { token.cancelQueue = undefined; running += 1; resolve(true); };
    token.cancelQueue = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      token.cancelQueue = undefined;
      resolve(false);
    };
    waiting.push(start);
  });
}

function releaseSlot(): void {
  running -= 1;
  waiting.shift()?.();
}

/** 個別に取り消せる読込の目印。取り消されたら結果を捨てる。 */
interface LoadToken {
  cancelled: boolean;
  requestId?: string;
  cancelQueue?: () => void;
  cancelNative?: () => void;
}

function cancelToken(token: LoadToken): void {
  if (token.cancelled) return;
  token.cancelled = true;
  token.cancelQueue?.();
  token.cancelNative?.();
}

/** 同時生成数を制限して OS に画像を頼む。解放・取消をまたいだ場合は null(結果は捨てる)。 */
async function loadImageLimited(
  id: string,
  maxSide: number,
  allowNetwork: boolean,
  token: LoadToken = { cancelled: false },
): Promise<string | null> {
  const startedIn = generation;
  loadTokens.add(token);
  const acquired = await acquireSlot(token);
  if (!acquired) { loadTokens.delete(token); return null; }
  try {
    if (startedIn !== generation || token.cancelled) return null;
    const requestId = `${startedIn}-${++requestSequence}`;
    token.requestId = requestId;
    token.cancelNative = () => { void DevicePhotos.cancelLoad({ id, maxSide, requestId }).catch(() => {}); };
    const { dataUrl } = await DevicePhotos.loadImage({ id, maxSide, allowNetwork, requestId });
    return startedIn === generation && !token.cancelled ? dataUrl : null;
  } catch (error) {
    if (startedIn !== generation || token.cancelled) return null; // 取消で失敗した読込は黙って捨てる
    throw error;
  } finally {
    releaseSlot();
    loadTokens.delete(token);
    token.cancelNative = undefined;
  }
}

/**
 * 表示用の縮小画像(長辺256px以下)。一覧ではクラウド取得をしない。
 * 解放後に終わった読込は null を返し、キャッシュへ入れない。
 */
export async function loadDevicePhotoThumbnail(id: string, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  const cached = thumbnailCache.get(id);
  if (cached !== undefined) return cached;
  const startedIn = generation;
  const token: LoadToken = { cancelled: false };
  const abort = () => cancelToken(token);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const dataUrl = await loadImageLimited(id, DEVICE_PHOTO_THUMBNAIL_MAX_SIDE, false, token);
    if (dataUrl === null || startedIn !== generation || signal?.aborted) return null;
    cacheThumbnail(id, dataUrl);
    return dataUrl;
  } finally { signal?.removeEventListener('abort', abort); }
}

/**
 * 拡大表示用の画像(長辺1600px以下、原寸は復号しない)。キャッシュしない。
 * 個別に開いた時だけ、OS 経由で iCloud 等からの取得を許す。
 */
export async function loadDevicePhotoPreview(id: string): Promise<string | null> {
  const token: LoadToken = { cancelled: false };
  previewTokens.set(id, token);
  try {
    return await loadImageLimited(id, DEVICE_PHOTO_PREVIEW_MAX_SIDE, true, token);
  } finally {
    if (previewTokens.get(id) === token) previewTokens.delete(id);
  }
}

/** 拡大表示を閉じた時に、読込中の1枚だけを取り消す(他の縮小画像の読込は止めない)。 */
export function cancelDevicePhotoPreview(id: string): void {
  const token = previewTokens.get(id);
  if (!token) return;
  cancelToken(token);
  previewTokens.delete(id);
}

/** 画面退出・背面化・日付変更・利用者変更・機能OFFで呼ぶ。キャッシュを捨て、読込を取り消す。 */
export function releaseDevicePhotoCache(): void {
  generation += 1;
  // 一括取消はネイティブへ1回だけ送り、待機要求はその場で完了させる。
  for (const token of loadTokens) {
    token.cancelNative = undefined;
    cancelToken(token);
  }
  previewTokens.clear();
  thumbnailCache.clear();
  thumbnailCacheBytes = 0;
  if (isDevicePhotosSupported()) void DevicePhotos.cancelLoads().catch(() => {});
}
