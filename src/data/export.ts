import { listCalendars, type Calendar } from './calendars';
import { listEvents, type EventItem } from './events';
import { listShiftTemplates, type ShiftTemplate } from './shift-templates';
import { err, ok, type Result } from './result';

/**
 * エクスポート用のデータ組み立て(FR17)。
 * ローカルで作成したデータ(`source === 'local'`)だけを1つのバンドルにする。
 * 取り込んだ外部予定は含めない。お気に入りシフトのテンプレも含める(Story 4.1)。
 *
 * データ取得は `listCalendars` / `listEvents` / `listShiftTemplates` を再利用する。
 */

export interface ExportBundle {
  app: 'calendar-app';
  /** shiftTemplates の追加で 1 → 2(Story 4.1)。 */
  schemaVersion: 2;
  /** 書き出した時刻(UTC ISO)。 */
  exportedAt: string;
  calendars: Calendar[];
  events: EventItem[];
  shiftTemplates: ShiftTemplate[];
}

function eventKey(e: EventItem): string {
  return e.startsAt ?? e.eventDate ?? '';
}

export async function buildExportBundle(): Promise<Result<ExportBundle>> {
  const calendars = await listCalendars();
  if (!calendars.ok) return err(calendars.error);
  const events = await listEvents();
  if (!events.ok) return err(events.error);
  const templates = await listShiftTemplates();
  if (!templates.ok) return err(templates.error);

  const localCalendars = calendars.value
    .filter((c) => c.source === 'local')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const localIds = new Set(localCalendars.map((c) => c.id));

  return ok({
    app: 'calendar-app',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    calendars: localCalendars,
    // ローカル予定のうち、書き出すカレンダーに属すものだけ(削除済みカレンダーの
    // 取り残しを含めず、バンドルの参照を自己完結させる)。
    events: events.value
      .filter((e) => e.source === 'local' && localIds.has(e.calendarId))
      .sort((a, b) => eventKey(a).localeCompare(eventKey(b))),
    shiftTemplates: [...templates.value].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ),
  });
}
