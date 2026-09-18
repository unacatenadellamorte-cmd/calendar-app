import { t, useLanguage } from '@/i18n';
import { BottomSheet } from '@/ui/BottomSheet';
import { useEffect, useRef, useState } from 'react';
import { getCropGeometry, type CropPosition } from '../model/cropGeometry';

interface Props {
  file: File | null;
  previewUrl: string | null;
  imageSize: { width: number; height: number } | null;
  frameAspect: number;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (position: CropPosition, frameAspect: number) => void;
  error?: string;
}

export function BackgroundCropSheet({
  file,
  previewUrl,
  imageSize,
  frameAspect,
  open,
  busy = false,
  onCancel,
  onConfirm,
  error,
}: Props) {
  useLanguage();
  const [position, setPosition] = useState<CropPosition>({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    drag.current = null;
    if (open) setPosition({ zoom: 1, x: 0, y: 0 });
  }, [open, file]);
  const change = (patch: Partial<CropPosition>) =>
    setPosition((current) => ({ ...current, ...patch }));
  const move = (dx: number, dy: number) =>
    change({
      x: Math.max(-1, Math.min(1, position.x + dx)),
      y: Math.max(-1, Math.min(1, position.y + dy)),
    });
  const crop = imageSize
    ? getCropGeometry(imageSize.width, imageSize.height, frameAspect, position)
    : null;

  return (
    <BottomSheet
      open={open}
      title={t('背景画像の範囲を調整')}
      onClose={onCancel}
      dismissible={!busy}
    >
      <div className="flex flex-col gap-4">
        <div
          role="application"
          aria-label={t('背景画像の切り出し範囲')}
          tabIndex={0}
          className="relative mx-auto max-w-xl touch-none overflow-hidden rounded-md bg-black focus:outline focus:outline-2 focus:outline-offset-2"
          style={{
            width: `min(100%, calc(60dvh * ${frameAspect}))`,
            aspectRatio: frameAspect,
          }}
          onKeyDown={(event) => {
            if (busy) return;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              move(-0.05, 0);
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              move(0.05, 0);
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(0, -0.05);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(0, 0.05);
            }
            if (event.key === '+' || event.key === '=') {
              event.preventDefault();
              change({ zoom: Math.min(3, position.zoom + 0.1) });
            }
            if (event.key === '-' || event.key === '_') {
              event.preventDefault();
              change({ zoom: Math.max(1, position.zoom - 0.1) });
            }
          }}
          onPointerDown={(event) => {
            if (busy || event.button !== 0 || !event.isPrimary) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.current = {
              x: position.x,
              y: position.y,
              px: event.clientX,
              py: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            if (busy || !drag.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            change({
              x: Math.max(
                -1,
                Math.min(
                  1,
                  drag.current.x - ((event.clientX - drag.current.px) / rect.width) * 2,
                ),
              ),
              y: Math.max(
                -1,
                Math.min(
                  1,
                  drag.current.y - ((event.clientY - drag.current.py) / rect.height) * 2,
                ),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {previewUrl && crop && imageSize && (
            <img
              src={previewUrl}
              alt={t('背景画像プレビュー')}
              draggable={false}
              className="absolute max-w-none"
              style={{
                width: `${(imageSize.width / crop.width) * 100}%`,
                height: `${(imageSize.height / crop.height) * 100}%`,
                left: `${(-crop.sx / crop.width) * 100}%`,
                top: `${(-crop.sy / crop.height) * 100}%`,
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 ring-2 ring-white/80" />
        </div>
        <p className="text-meta text-ink-secondary">
          {t('画像を指で動かせます。矢印キーでも調整できます。')}
        </p>
        {error && (
          <p role="alert" className="text-meta text-danger">
            {t(error)}
          </p>
        )}
        <label className="flex items-center gap-3 text-body">
          {t('拡大')}
          <input
            aria-label={t('拡大')}
            type="range"
            disabled={busy}
            min="1"
            max="3"
            step="0.01"
            value={position.zoom}
            onChange={(event) => change({ zoom: Number(event.target.value) })}
            className="min-w-0 flex-1"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-sm border border-border-hairline px-4"
            disabled={busy}
            onClick={onCancel}
          >
            {t('キャンセル')}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-sm bg-accent px-4 text-white disabled:opacity-40"
            disabled={busy || !imageSize || !file}
            onClick={() => onConfirm(position, frameAspect)}
          >
            {busy ? t('処理中…') : t('この範囲で設定')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
