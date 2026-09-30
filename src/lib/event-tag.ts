import type { EventTag } from '@/data/event-tags';
import { isValidLocalDate, localDateString } from './datetime';

/** 日付を保ったままひな形の値を複写する。タグと保存済み予定は連動させない。 */
export function applyEventTag(
  tag: Pick<EventTag, 'name' | 'color' | 'startLocal' | 'endLocal' | 'allDay'>,
  date: string,
) {
  if (!isValidLocalDate(date)) return null;
  const next = new Date(`${date}T12:00:00`);
  if (tag.endLocal < tag.startLocal) next.setDate(next.getDate() + 1);
  return {
    title: tag.name,
    labelColor: tag.color,
    allDay: tag.allDay ?? false,
    dateLocal: date,
    startLocal: `${date}T${tag.startLocal}`,
    endLocal: `${localDateString(next).replace(/^\d+-/, `${String(next.getFullYear()).padStart(4, '0')}-`)}T${tag.endLocal}`,
  };
}
