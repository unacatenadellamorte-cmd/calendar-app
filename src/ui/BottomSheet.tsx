import { useEffect, useRef, type ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 下から出るシート。1段まで(EXPERIENCE.md)。
 * Escape とスクリム押下で閉じる。開いたときにシート内へフォーカスを移す。
 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative mx-auto w-full max-w-2xl rounded-t-lg bg-surface-base p-4 pb-8 shadow-lg"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-hairline" />
        <h2 className="text-body font-semibold text-ink-primary">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
