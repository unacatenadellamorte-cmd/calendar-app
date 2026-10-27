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
  // 継ぎ目をラベルへ1px重ね、縦の幅を4pxに保つ。
  const left = 4.5;
  const right = 8.5;
  const outer = Math.min(half, 7);
  const inner = Math.min(2, Math.max(0, (distance - size.height) / 2));
  const path = offset === 0
    ? `M -1 ${-half} H 14 V ${half} H -1 Z`
    : `M -1 ${-half} H ${right - outer} Q ${right} ${-half} ${right} ${-half + outer}
       V ${distance - half - inner} Q ${right} ${distance - half} ${right + inner} ${distance - half}
       H 14 V ${distance + half} H ${left + outer}
       Q ${left} ${distance + half} ${left} ${distance + half - outer}
       V ${half + inner} Q ${left} ${half} ${left - inner} ${half} H -1 Z`;
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
