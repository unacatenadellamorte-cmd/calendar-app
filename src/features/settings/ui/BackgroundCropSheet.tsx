import { t, useLanguage } from '@/i18n';
import { BottomSheet } from '@/ui/BottomSheet';
import { useEffect, useRef, useState } from 'react';
import { formatMonthTitle } from '@/lib/datetime';
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
type PointerPoint = { x: number; y: number };
function firstTwo(points: Map<number, PointerPoint>): [PointerPoint, PointerPoint] | null {
  const values = [...points.values()];
  return values.length >= 2 ? [values[0]!, values[1]!] : null;
}
function firstPoint(points: Map<number, PointerPoint>): PointerPoint | null {
  return [...points.values()][0] ?? null;
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
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  useEffect(() => {
    drag.current = null;
    pointers.current.clear();
    pinch.current = null;
    if (open) setPosition({ zoom: 1, x: 0, y: 0 });
  }, [open, file]);
  useEffect(() => {
    if (!busy) return;
    drag.current = null;
    pointers.current.clear();
    pinch.current = null;
  }, [busy]);
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
  const releasePointer = (pointerId: number) => {
    if (!pointers.current.has(pointerId)) return;
    pointers.current.delete(pointerId);
    if (pointers.current.size >= 2) {
      const pair = firstTwo(pointers.current);
      if (!pair) return;
      const [a, b] = pair;
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: position.zoom };
    } else pinch.current = null;
    if (pointers.current.size === 1) {
      const point = firstPoint(pointers.current);
      if (!point) return;
      drag.current = { x: position.x, y: position.y, px: point.x, py: point.y };
      return;
    }
    drag.current = null;
  };

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
            if (busy || (event.button !== undefined && event.button !== 0)) return;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            event.currentTarget.setPointerCapture?.(event.pointerId);
            if (pointers.current.size === 2) {
              const pair = firstTwo(pointers.current);
              if (!pair) return;
              const [a, b] = pair;
              pinch.current = {
                distance: Math.hypot(a.x - b.x, a.y - b.y),
                zoom: position.zoom,
              };
              drag.current = null;
              return;
            }
            drag.current = {
              x: position.x,
              y: position.y,
              px: event.clientX,
              py: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            if (busy || !pointers.current.has(event.pointerId)) return;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.current.size >= 2 && pinch.current) {
              const pair = firstTwo(pointers.current);
              if (!pair) return;
              const [a, b] = pair;
              const distance = Math.hypot(a.x - b.x, a.y - b.y);
              change({
                zoom: Math.max(
                  1,
                  Math.min(
                    3,
                    (pinch.current.zoom * distance) / Math.max(1, pinch.current.distance),
                  ),
                ),
              });
              return;
            }
            if (!drag.current) return;
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
          onPointerUp={(event) => {
            releasePointer(event.pointerId);
          }}
          onPointerCancel={(event) => {
            releasePointer(event.pointerId);
          }}
          onLostPointerCapture={(event) => {
            releasePointer(event.pointerId);
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
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col p-2 text-[8px]"
            style={{
              color: 'var(--color-ink-primary)',
            }}
          >
            <div
              className="mb-1 flex items-center justify-between rounded-sm px-1 py-0.5 font-semibold"
              style={{
                backgroundColor: 'var(--color-chrome-surface)',
                color: 'var(--color-chrome-ink)',
              }}
            >
              <span>{formatMonthTitle('2026-09-01')}</span>
              <span>{t('予定')}</span>
            </div>
            <div className="grid flex-1 grid-cols-7 grid-rows-5 gap-px">
              {Array.from({ length: 35 }, (_, index) => (
                <span
                  key={index}
                  className="rounded-[1px] border border-border-hairline p-px"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--color-surface-base) 60%, transparent)',
                  }}
                >
                  {index + 1 <= 30 ? index + 1 : ''}
                  {index % 7 === 2 && index < 28 ? (
                    <i
                      className="block truncate rounded-sm px-px"
                      style={{
                        backgroundColor: 'var(--color-chrome-surface)',
                        color: 'var(--color-chrome-ink)',
                      }}
                    >
                      {t('予定')}
                    </i>
                  ) : null}
                </span>
              ))}
            </div>
            <div
              className="mt-1 flex items-center justify-between rounded-sm px-1 py-0.5"
              style={{
                backgroundColor: 'var(--color-chrome-surface)',
                color: 'var(--color-chrome-ink)',
              }}
            >
              <span>{t('予定')}</span>
              <span>{t('追加')}</span>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 ring-2 ring-white/80" />
        </div>
        <p className="text-meta text-ink-secondary">
          {t('画像を指で動かせます。2本指で拡大縮小できます。矢印キーでも調整できます。')}
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
