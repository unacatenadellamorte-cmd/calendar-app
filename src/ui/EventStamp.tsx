import { t, useLanguage } from '@/i18n';
import { EVENT_STAMPS } from '@/lib/event-stamps';

export function EventStamp({
  id,
  color = 'var(--color-accent)',
  size = '1.25em',
  label = true,
}: {
  id: string;
  color?: string;
  size?: number | string;
  label?: boolean;
}) {
  useLanguage();
  const stamp = EVENT_STAMPS.find(([key]) => key === id);
  if (!stamp) return null;
  const [, name, path] = stamp;
  return (
    <svg
      role={label ? 'img' : undefined}
      aria-label={label ? t(name) : undefined}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      style={{ display: 'inline-block', verticalAlign: '-0.2em' }}
    >
      {/* ラベルがテーマ色と同系色でも線画を読めるよう、テーマの面色で縁を付ける。 */}
      <path d={path} stroke="var(--color-surface-base)" strokeWidth="3.7" />
      <path d={path} />
    </svg>
  );
}
