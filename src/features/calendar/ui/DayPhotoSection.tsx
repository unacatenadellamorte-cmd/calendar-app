import { useEffect, useState } from 'react';
import { t, useLanguage } from '@/i18n';
import { BottomSheet } from '@/ui/BottomSheet';
import { formatClock } from '@/lib/datetime';
import {
  cancelDevicePhotoPreview,
  isDevicePhotosSupported,
  loadDevicePhotoPreview,
  loadDevicePhotoThumbnail,
  type DevicePhotoAsset,
} from '@/platform/devicePhotos';
import { useDevicePhotosEnabled } from '@/features/settings/model/useDevicePhotosEnabled';
import { useDayPhotos } from '@/features/calendar/model/useDayPhotos';

interface DayPhotoSectionProps {
  /** 選択中の日付 "YYYY-MM-DD"(端末のローカル日付)。 */
  date: string;
  /** true の間は拡大表示を閉じ、開かせない(他のレイヤーと重ねない)。 */
  suspended?: boolean;
  /** 利用者の識別子。変わったら前の利用者の画像を解放して読み直す(外部へは渡さない)。 */
  userId?: string;
}

// 仮想化の寸法。表示範囲(+前後1行)の行だけを描画し、縮小画像も表示された分だけ読む。
const COLUMNS = 4;
const TILE_HEIGHT = 80;
const ROW_HEIGHT = TILE_HEIGHT + 4;
const VIEWPORT_HEIGHT = ROW_HEIGHT * 3;
const OVERSCAN_ROWS = 1;

/** 選択日に撮影した端末の写真。設定OFF・Webでは何も出さず、写真APIも呼ばない。 */
export function DayPhotoSection({ date, suspended = false, userId }: DayPhotoSectionProps) {
  useLanguage();
  const { devicePhotosEnabled } = useDevicePhotosEnabled();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DevicePhotoAsset | null>(null);
  const supported = devicePhotosEnabled && isDevicePhotosSupported();
  // OFF になったら開閉状態も捨て、ON に戻しても利用者が開くまで読まない。
  useEffect(() => {
    if (!supported) setOpen(false);
  }, [supported]);
  // 欄を閉じる・日付変更・OFF では拡大表示も閉じる(画像は PhotoPreview の解除で解放)。
  useEffect(() => {
    setPreview(null);
  }, [open, date, supported, suspended, userId]);
  const { state, active, requestPermission, reload, reselectLimited, loadMore } = useDayPhotos(
    date,
    supported && open,
    userId,
  );
  useEffect(() => {
    if (!active) setPreview(null);
  }, [active]);
  if (!supported) return null;
  return (
    <section data-date={date} className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between rounded-md border border-border-hairline bg-surface-raised px-4 text-body text-ink-primary"
      >
        {t('この日の写真')}
        <span aria-hidden="true" className="text-ink-secondary">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && state.kind === 'loading' && (
        <p role="status" className="mt-2 text-meta text-ink-secondary">{t('読み込み中…')}</p>
      )}
      {open && state.kind === 'needs-permission' && state.permission === 'denied' && (
        <div className="mt-2 space-y-2">
          <p className="text-meta text-ink-secondary">
            {t('端末の設定アプリで、このアプリの写真へのアクセスを許可してください。')}
          </p>
          <button
            type="button"
            onClick={reload}
            className="min-h-11 w-full rounded-sm border border-accent px-4 text-body text-accent"
          >
            {t('もう一度確認')}
          </button>
        </div>
      )}
      {open && state.kind === 'needs-permission' && state.permission === 'prompt' && (
        <div className="mt-2 space-y-2">
          <p className="text-meta text-ink-secondary">
            {t('この日に撮影した写真を表示するには、写真へのアクセスを許可してください。')}
          </p>
          <button
            type="button"
            onClick={() => void requestPermission()}
            className="min-h-11 w-full rounded-sm border border-accent px-4 text-body text-accent"
          >
            {t('写真へのアクセスを許可')}
          </button>
        </div>
      )}
      {open && state.kind === 'ready' && state.limited && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-meta text-ink-secondary">{t('一部の写真だけが許可されています。')}</p>
          <button
            type="button"
            onClick={() => void reselectLimited()}
            className="min-h-11 shrink-0 text-meta text-accent"
          >
            {t('表示する写真を選び直す')}
          </button>
        </div>
      )}
      {open && state.kind === 'error' && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p role="alert" className="text-meta text-danger">
            {t('写真を読み込めませんでした。')}
          </p>
          <button type="button" onClick={reload} className="min-h-11 shrink-0 text-meta text-accent">
            {t('再試行')}
          </button>
        </div>
      )}
      {open && state.kind === 'ready' && state.assets.length === 0 && (
        <p className="mt-2 text-meta text-ink-secondary">{t('この日に撮影した写真はありません。')}</p>
      )}
      {open && state.kind === 'ready' && state.assets.length > 0 && (
        <PhotoGrid assets={state.assets} onOpen={setPreview} />
      )}
      {open && state.kind === 'ready' && state.hasMore && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {state.loadMoreFailed && (
            <p role="alert" className="text-meta text-danger">
              {t('写真を読み込めませんでした。')}
            </p>
          )}
          <button
            type="button"
            disabled={state.loadingMore}
            onClick={() => void loadMore()}
            className="min-h-11 w-full rounded-sm border border-accent px-4 text-body text-accent"
          >
            {t('さらに読み込む')}
          </button>
        </div>
      )}
      <PhotoPreview asset={suspended || !active ? null : preview} onClose={() => setPreview(null)} />
    </section>
  );
}

function PhotoGrid({
  assets,
  onOpen,
}: {
  assets: DevicePhotoAsset[];
  onOpen: (asset: DevicePhotoAsset) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const rows = Math.ceil(assets.length / COLUMNS);
  const last = Math.min(
    rows - 1,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN_ROWS - 1,
  );
  const first = Math.min(last, Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS));
  return (
    <div
      role="list"
      aria-label={t('撮影した写真の一覧')}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      style={{ height: Math.min(rows * ROW_HEIGHT, VIEWPORT_HEIGHT) }}
      className="mt-2 overflow-y-auto overscroll-contain"
    >
      <div style={{ height: rows * ROW_HEIGHT, position: 'relative' }}>
        <div
          style={{ position: 'absolute', top: first * ROW_HEIGHT, left: 0, right: 0 }}
          className="grid grid-cols-4 gap-1"
        >
          {assets.slice(first * COLUMNS, (last + 1) * COLUMNS).map((asset) => (
            <div key={asset.id} role="listitem" style={{ height: TILE_HEIGHT }}>
              <PhotoTile asset={asset} onOpen={onOpen} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function clockOf(createdMs: number): string {
  return formatClock(new Date(createdMs).toISOString());
}

function PhotoPreview({ asset, onClose }: { asset: DevicePhotoAsset | null; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = asset?.id;
  useEffect(() => {
    if (!id) return;
    let current = true;
    loadDevicePhotoPreview(id).then(
      (dataUrl) => {
        if (current) setSrc(dataUrl);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
      cancelDevicePhotoPreview(id);
      setSrc(null);
      setFailed(false);
    };
  }, [id]);
  return (
    <BottomSheet open={asset !== null} title={t('写真')} onClose={onClose}>
      {asset && !src && !failed && (
        <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
      )}
      {asset && failed && (
        <p role="alert" className="text-meta text-danger">
          {t('この写真は端末のOSから取得できませんでした(クラウド上の写真など)。')}
        </p>
      )}
      {asset && src && (
        <img
          src={src}
          alt={t('{0} に撮影した写真', [clockOf(asset.createdMs)])}
          className="mx-auto max-h-[70dvh] w-full object-contain"
        />
      )}
    </BottomSheet>
  );
}

function PhotoTile({
  asset,
  onOpen,
}: {
  asset: DevicePhotoAsset;
  onOpen: (asset: DevicePhotoAsset) => void;
}) {
  const { id, createdMs } = asset;
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    loadDevicePhotoThumbnail(id, controller.signal).then(
      (dataUrl) => {
        if (current) setSrc(dataUrl);
      },
      () => {},
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [id]);
  return (
    <button
      type="button"
      aria-label={t('{0} の写真を拡大', [clockOf(createdMs)])}
      onClick={() => onOpen(asset)}
      className="h-full w-full overflow-hidden rounded-sm bg-surface-raised"
    >
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}
