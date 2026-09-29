import { useLayoutEffect, useRef, type ReactNode, type CSSProperties } from 'react';

interface MonthSlideProps {
  monthKey: string;
  offset: number;
  dragging: boolean;
  children: ReactNode;
  /** 予定の公開範囲や内容が変わったら表示用コピーも即座に破棄する。 */
  contentVersion?: unknown;
}

/** 退出する月は操作不能の表示用コピーにし、予定やフォームの状態は複製しない。 */
export function MonthSlide({
  monthKey,
  offset,
  dragging,
  children,
  contentVersion,
}: MonthSlideProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const previous = useRef<{ key: string; node: HTMLElement; version: unknown } | null>(null);
  const outgoing = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    outgoing.current?.remove();
    outgoing.current = null;
    page.current?.classList.remove('month-page-enter');
  };
  useLayoutEffect(() => {
    const current = page.current;
    const host = viewport.current;
    if (!current || !host) return;
    const old = previous.current;
    if (dragging) clear();
    if (old && old.version !== contentVersion) clear();
    if (old && old.version === contentVersion && old.key !== monthKey) {
      clear();
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const direction = monthKey > old.key ? 1 : -1;
        const ghost = old.node;
        ghost.setAttribute('aria-hidden', 'true');
        ghost.setAttribute('inert', '');
        ghost.querySelectorAll('[id], [data-testid]').forEach((node) => {
          node.removeAttribute('id');
          node.removeAttribute('data-testid');
        });
        ghost.className = 'month-page-exit';
        ghost.style.setProperty(
          '--month-exit-start',
          ghost.style.transform || 'translateX(0)',
        );
        ghost.style.setProperty('--month-exit-end', `translateX(${-direction * 100}%)`);
        ghost.style.transform = '';
        ghost.style.transition = 'none';
        host.appendChild(ghost);
        outgoing.current = ghost;
        const fromOffset =
          /translateX\((-?[\d.]+)px\)/.exec(
            old.node.style.getPropertyValue('--month-exit-start'),
          )?.[1] ?? '0';
        current.style.setProperty(
          '--month-enter-start',
          `translateX(calc(${direction * 100}% + ${fromOffset}px))`,
        );
        // 連続した月送りでも新しい方向でアニメーションを開始する。
        void current.offsetWidth;
        current.classList.add('month-page-enter');
        timer.current = setTimeout(clear, 300);
      }
    }
    const snapshot = current.cloneNode(true) as HTMLElement;
    snapshot.className = '';
    previous.current = { key: monthKey, node: snapshot, version: contentVersion };
  });
  useLayoutEffect(() => clear, []);
  return (
    <div ref={viewport} className="relative overflow-hidden" data-testid="month-slide">
      <div
        ref={page}
        style={
          {
            transform: `translateX(${offset}px)`,
            transition: dragging ? 'none' : 'transform 180ms ease-out',
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
