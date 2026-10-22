import { useEffect, useRef, type ReactNode } from 'react';

interface SwipeSurfaceProps {
  /** 横スワイプ確定時。左スワイプ(次へ)は +1、右スワイプ(前へ)は -1。 */
  onSwipe: (direction: 1 | -1) => void;
  children: ReactNode;
  className?: string;
}

const THRESHOLD_PX = 50;
const AXIS_LOCK_PX = 10;
/** スワイプ直後に合成されるクリックだけを抑止する猶予(これを過ぎたら通常のクリックを通す)。 */
const CLICK_GUARD_MS = 400;

/**
 * 横スワイプだけを拾う薄いラッパー。縦の動きはスクロールに任せ、何も呼ばない。
 * 横スワイプが成立した直後の1回のクリックは握りつぶし、予定や画像を誤って開かない。
 */
export function SwipeSurface({ onSwipe, children, className }: SwipeSurfaceProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);
  const suppressClick = useRef(false);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (guardTimer.current !== null) clearTimeout(guardTimer.current);
  }, []);
  const reset = () => {
    start.current = null;
    axis.current = null;
  };
  return (
    <div
      className={['touch-pan-y', className].filter(Boolean).join(' ')}
      data-testid="swipe-surface"
      onTouchStart={(event) => {
        // ポータル内の写真操作を背面の日付送りとして扱わない。
        if (!event.currentTarget.contains(event.target as Node)) {
          reset();
          return;
        }
        suppressClick.current = false;
        const touch = event.touches[0];
        if (event.touches.length !== 1 || !touch) {
          reset();
          return;
        }
        axis.current = null;
        start.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        const origin = start.current;
        const touch = event.touches[0];
        if (!origin || !touch) return;
        if (event.touches.length !== 1) {
          reset();
          return;
        }
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        if (!axis.current && Math.max(Math.abs(dx), Math.abs(dy)) > AXIS_LOCK_PX) {
          axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
      }}
      onTouchEnd={(event) => {
        const origin = start.current;
        const touch = event.changedTouches[0];
        const lockedAxis = axis.current;
        reset();
        if (!origin || !touch || lockedAxis === 'y') return;
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESHOLD_PX) {
          suppressClick.current = true;
          if (guardTimer.current !== null) clearTimeout(guardTimer.current);
          guardTimer.current = setTimeout(() => {
            suppressClick.current = false;
          }, CLICK_GUARD_MS);
          onSwipe(dx < 0 ? 1 : -1);
        }
      }}
      onTouchCancel={reset}
      onClickCapture={(event) => {
        if (!event.currentTarget.contains(event.target as Node) || event.detail === 0 || !suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
