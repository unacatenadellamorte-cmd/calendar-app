import { useLayoutEffect, useRef, useState } from 'react';

/** ラベルと同じ高さから続き、縦のマーカーへ滑らかに曲がる塗りの帯。 */
export function MonthEventConnector({ eventId, offset, color, joinedBefore, nextJoinedAfter, filled }: {
  eventId: string;
  offset: number;
  color: string;
  joinedBefore: boolean;
  nextJoinedAfter: boolean;
  filled: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ height: 12.8, pitch: 14.8, width: 48, nextWidth: 48, radius: 2 });
  useLayoutEffect(() => {
    const slot = ref.current?.parentElement;
    if (!slot) return;
    const measure = () => {
      const height = slot.getBoundingClientRect().height;
      if (!height) return;
      const gap = Number.parseFloat(getComputedStyle(slot.parentElement!).rowGap) || 0;
      const width = slot.getBoundingClientRect().width;
      const nextChip = [...(slot.parentElement?.nextElementSibling?.querySelectorAll<HTMLElement>('[data-event-id]') ?? [])]
        .find((chip) => chip.dataset.eventId === eventId);
      const nextWidth = nextChip?.getBoundingClientRect().width ?? width;
      const radius = Math.min(height / 2, Number.parseFloat(getComputedStyle(slot.querySelector('button')!).borderRadius) || 2);
      setSize((old) => old.height === height && old.pitch === height + gap && old.width === width && old.nextWidth === nextWidth && old.radius === radius
        ? old : { height, pitch: height + gap, width, nextWidth, radius });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(slot);
    return () => observer?.disconnect();
  }, [eventId]);
  const half = size.height / 2;
  const distance = Math.abs(offset) * size.pitch;
  // 継ぎ目をラベルへ1px重ね、縦の幅を4pxに保つ。
  const left = 4.5;
  const right = 8.5;
  const outer = Math.min(half, 7);
  const inner = Math.min(3, half / 2);
  const connector = offset === 0
    ? `M -1 ${-half} H 14 V ${half} H -1 Z`
    : `M -1 ${-half} H ${right - outer} Q ${right} ${-half} ${right} ${-half + outer}
       V ${distance - half - inner} Q ${right} ${distance - half} ${right + inner} ${distance - half}
       H 14 V ${distance + half} H ${left + outer}
       Q ${left} ${distance + half} ${left} ${distance + half - outer}
       V ${half + inner} Q ${left} ${half} ${left - inner} ${half} H -1 Z`;
  // ラベル本体と曲がる部分を同じパスで塗り、別描画の境界をなくす。
  const start = (joinedBefore ? 8 : 4) - size.width;
  const radius = joinedBefore ? 0 : size.radius;
  const body = `M ${start + radius} ${-half} H 1 V ${half} H ${start + radius}
    Q ${start} ${half} ${start} ${half - radius} V ${-half + radius}
    Q ${start} ${-half} ${start + radius} ${-half} Z`;
  const end = 9 + size.nextWidth;
  const tail = nextJoinedAfter ? '' : `M 12 ${distance - half} H ${end - size.radius}
    Q ${end} ${distance - half} ${end} ${distance - half + size.radius}
    V ${distance + half - size.radius} Q ${end} ${distance + half} ${end - size.radius} ${distance + half}
    H 12 Z`;
  const bend = Math.min(3, distance / 2);
  const outline = offset === 0 ? 'M 0 0 H 13'
    : `M 0 0 H 3 Q 6.5 0 6.5 ${bend} V ${distance - bend} Q 6.5 ${distance} 10 ${distance} H 13`;
  return <svg
    ref={ref}
    aria-hidden="true"
    className="month-event-connector"
    viewBox={`0 0 13 ${size.pitch}`}
    preserveAspectRatio="none"
    data-connector-event={eventId}
    data-lane-offset={offset}
  >
    <path d={filled ? `${body} ${connector} ${tail}` : outline}
      fill={filled ? color : 'none'} stroke={filled ? undefined : color}
      strokeWidth={filled ? undefined : 2.5}
      transform={offset < 0 ? 'scale(1 -1)' : undefined} />
  </svg>;
}
