import { useLayoutEffect, useRef, useState } from 'react';

/** ラベルと同じ高さから続き、縦のマーカーへ滑らかに曲がる塗りの帯。 */
export function MonthEventConnector({ eventId, offset, color }: {
  eventId: string;
  offset: number;
  color: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ height: 12.8, pitch: 14.8 });
  useLayoutEffect(() => {
    const slot = ref.current?.parentElement;
    if (!slot) return;
    const measure = () => {
      const height = slot.getBoundingClientRect().height;
      if (!height) return;
      const gap = Number.parseFloat(getComputedStyle(slot.parentElement!).rowGap) || 0;
      setSize((old) => old.height === height && old.pitch === height + gap
        ? old : { height, pitch: height + gap });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(slot);
    return () => observer?.disconnect();
  }, []);
  const half = size.height / 2;
  const distance = Math.abs(offset) * size.pitch;
  // 外側はラベルの厚みで大きく曲げ、内側は小さく丸めて縦の幅を5pxに保つ。
  const outer = Math.min(half, 7);
  const inner = Math.min(2, Math.max(0, (distance - size.height) / 2));
  const path = offset === 0
    ? `M 0 ${-half} H 13 V ${half} H 0 Z`
    : `M 0 ${-half} H ${9 - outer} Q 9 ${-half} 9 ${-half + outer}
       V ${distance - half - inner} Q 9 ${distance - half} ${9 + inner} ${distance - half}
       H 13 V ${distance + half} H ${4 + outer}
       Q 4 ${distance + half} 4 ${distance + half - outer}
       V ${half + inner} Q 4 ${half} ${4 - inner} ${half} H 0 Z`;
  return <svg
    ref={ref}
    aria-hidden="true"
    className="month-event-connector"
    viewBox={`0 0 13 ${size.pitch}`}
    preserveAspectRatio="none"
    data-connector-event={eventId}
    data-lane-offset={offset}
  >
    <path d={path} fill={color} transform={offset < 0 ? 'scale(1 -1)' : undefined} />
  </svg>;
}
