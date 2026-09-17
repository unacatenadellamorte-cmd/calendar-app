import { t, useLanguage } from '@/i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { registerLayerBack } from '@/platform/layerBack';
interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}
/** 下へ引いて閉じられるレイヤー。本文のスクロールとハンドル操作は分離する。 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const suppressClick = useRef(false);
  const startY = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offset, setOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const dismiss = useCallback(() => closeRef.current(), []);
  useEffect(() => {
    if (!open) return;
    setOffset(0);
    setClosing(false);
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const unregister = registerLayerBack(dismiss);
    const onKey = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('[role=dialog]')).at(-1) !== panelRef.current)
        return;
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
      if (e.key === 'Tab') {
        const items = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        );
        const first = items?.[0];
        const last = items?.[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === panelRef.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unregister();
      window.removeEventListener('keydown', onKey);
      if (timer.current) clearTimeout(timer.current);
      previousFocus?.focus();
    };
  }, [open, dismiss]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end overscroll-none">
      <button
        type="button"
        aria-label={t('閉じる')}
        onClick={dismiss}
        className="absolute inset-0 bg-black/30 animate-[fade-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          transform: `translateY(${closing ? '100%' : `${offset}px`})`,
          transition: closing || offset === 0 ? 'transform 180ms ease-out' : 'none',
        }}
        className="relative mx-auto flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-lg bg-surface-base px-4 pb-4 shadow-lg"
      >
        <button
          type="button"
          aria-label={t('下にスライドして閉じる')}
          onClick={() => {
            if (!suppressClick.current) dismiss();
            suppressClick.current = false;
          }}
          className="flex min-h-11 w-full shrink-0 touch-none flex-col items-center justify-center gap-1"
          onPointerDown={(e) => {
            suppressClick.current = false;
            startY.current = e.clientY;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (startY.current !== null) setOffset(Math.max(0, e.clientY - startY.current));
          }}
          onPointerUp={(e) => {
            const distance = startY.current === null ? 0 : e.clientY - startY.current;
            startY.current = null;
            suppressClick.current = Math.abs(distance) > 5;
            if (distance >= 64) {
              setClosing(true);
              timer.current = setTimeout(dismiss, 180);
            } else setOffset(0);
          }}
          onPointerCancel={() => {
            startY.current = null;
            setOffset(0);
          }}
        >
          <span className="h-1 w-10 rounded-full bg-border-hairline" />
          <span className="text-[10px] text-ink-secondary">{t('下にスライドして閉じる')}</span>
        </button>
        <h2 className="shrink-0 text-body font-semibold text-ink-primary">{title}</h2>
        <div className="mt-3 overflow-y-auto overscroll-contain pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
