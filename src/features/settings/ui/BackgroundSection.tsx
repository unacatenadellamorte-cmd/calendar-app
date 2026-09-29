import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { BackgroundCropSheet } from './BackgroundCropSheet';
import type { CropPosition } from '../model/cropGeometry';
import {
  applyBackground,
  prepareBackground,
  readBackground,
  storeBackground,
  validateBackgroundFile,
} from '../model/backgroundImage';

export function BackgroundSection() {
  useLanguage();
  const [hasImage, setHasImage] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [frameAspect, setFrameAspect] = useState(
    () => window.innerWidth / Math.max(1, window.innerHeight),
  );
  const busyRef = useRef(true);
  const operation = useRef(0);
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    const update = () => setFrameAspect(window.innerWidth / Math.max(1, window.innerHeight));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    let active = true;
    void readBackground()
      .then((image) => {
        if (active) setHasImage(Boolean(image));
      })
      .catch(() => {
        if (active) setError(t('保存した背景を読み込めませんでした。'));
      })
      .finally(() => {
        if (active) {
          busyRef.current = false;
          setBusy(false);
        }
      });
    return () => {
      active = false;
      operation.current += 1;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);
  const closeCrop = (invalidate = true) => {
    if (invalidate) operation.current += 1;
    setCropOpen(false);
    setFile(null);
    setImageSize(null);
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
      setPreviewUrl(null);
    }
  };
  const choose = (selected: File) => {
    if (busyRef.current) return;
    try {
      validateBackgroundFile(selected);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('画像を読み込めませんでした。別の画像を選んでください。'),
      );
      return;
    }
    const token = ++operation.current;
    setError('');
    setMessage('');
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(selected);
    previewRef.current = url;
    setPreviewUrl(url);
    setFile(selected);
    setImageSize(null);
    setCropOpen(false);
    const image = new Image();
    image.onload = () => {
      if (token !== operation.current) return;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setCropOpen(true);
    };
    image.onerror = () => {
      if (token !== operation.current) return;
      setError(t('画像を読み込めませんでした。別の画像を選んでください。'));
      closeCrop();
    };
    image.src = url;
  };
  const confirm = async (position: CropPosition, aspect: number) => {
    if (!file || busyRef.current) return;
    const token = ++operation.current;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const image = await prepareBackground(file, position, aspect);
      if (token !== operation.current) return;
      await storeBackground(image);
      if (token !== operation.current) return;
      applyBackground(image);
      setHasImage(true);
      setMessage(t('背景画像を変更しました。'));
      closeCrop(false);
    } catch (reason) {
      if (token === operation.current)
        setError(
          reason instanceof Error && /画像/.test(reason.message)
            ? reason.message
            : t('背景を保存できませんでした。空き容量を確認して、もう一度お試しください。'),
        );
    } finally {
      if (token === operation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const remove = async () => {
    if (busyRef.current || !hasImage) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await storeBackground(null);
      applyBackground(null);
      setHasImage(false);
      setMessage(t('背景画像を解除しました。'));
    } catch {
      setError(t('背景を保存できませんでした。空き容量を確認して、もう一度お試しください。'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <section aria-labelledby="background-heading" className="mt-6">
        <h2 id="background-heading" className="text-body font-semibold">
          {t('背景画像')}
        </h2>
        <p className="mt-1 text-meta text-ink-secondary">
          {t('画像はこの端末だけに保存します。JPEG・PNG・WebP、20MBまで。')}
        </p>
        {hasImage && (
          <div
            role="img"
            aria-label={t('現在の背景画像')}
            className="mt-3 h-28 rounded-md bg-cover bg-center"
            style={{ backgroundImage: 'var(--app-background-image)' }}
          />
        )}
        <label className="mt-3 flex flex-col gap-2 text-body">
          {t('背景画像を選ぶ')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            className="w-full min-w-0 rounded-sm border border-border-hairline bg-surface-raised p-2 text-meta"
            onChange={(event) => {
              setError('');
              const selected = event.target.files?.[0];
              event.target.value = '';
              if (selected) choose(selected);
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !hasImage}
          onClick={() => void remove()}
          className="mt-2 min-h-11 rounded-sm border border-border-hairline bg-surface-raised px-4 disabled:opacity-40"
        >
          {t('背景画像を解除')}
        </button>
        {error && (
          <div className="mt-2 flex items-start gap-2 text-meta text-danger">
            <p role="alert">{t(error)}</p>
            <button
              type="button"
              aria-label={t('閉じる')}
              className="min-h-11 px-2"
              onClick={() => setError('')}
            >
              ×
            </button>
          </div>
        )}
        <p role="status" className="text-meta text-ink-secondary">
          {busy ? t('処理中…') : message}
        </p>
      </section>
      <BackgroundCropSheet
        file={file}
        previewUrl={previewUrl}
        imageSize={imageSize}
        frameAspect={frameAspect}
        open={cropOpen}
        busy={busy}
        error={cropOpen ? error : undefined}
        onCancel={() => {
          if (!busy) closeCrop();
        }}
        onConfirm={(position, aspect) => void confirm(position, aspect)}
      />
    </>
  );
}
