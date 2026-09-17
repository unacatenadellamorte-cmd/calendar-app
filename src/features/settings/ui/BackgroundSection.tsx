import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  applyBackground,
  prepareBackground,
  readBackground,
  storeBackground,
} from '../model/backgroundImage';
export function BackgroundSection() {
  useLanguage();
  const [hasImage, setHasImage] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busyRef = useRef(true);
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
    };
  }, []);
  const change = async (file: File | null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const image = file ? await prepareBackground(file) : null;
      await storeBackground(image);
      applyBackground(image);
      setHasImage(Boolean(image));
      setMessage(image ? t('背景画像を変更しました。') : t('背景画像を解除しました。'));
    } catch (reason) {
      setError(
        reason instanceof Error && /画像/.test(reason.message)
          ? reason.message
          : t('背景を保存できませんでした。空き容量を確認して、もう一度お試しください。'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
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
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void change(file);
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy || !hasImage}
        onClick={() => void change(null)}
        className="mt-2 min-h-11 rounded-sm border border-border-hairline bg-surface-raised px-4 disabled:opacity-40"
      >
        {t('背景画像を解除')}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-meta text-danger">
          {t(error)}
        </p>
      )}
      <p role="status" className="text-meta text-ink-secondary">
        {busy ? t('処理中…') : message}
      </p>
    </section>
  );
}
