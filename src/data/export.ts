import { listCalendars, type Calendar } from './calendars';
import { listEvents, type EventItem } from './events';
import { err, ok, type Result } from './result';

/**
 * エクスポート用のデータ組み立て(FR17)。
 * ローカルで作成したデータ(`source === 'local'`)だけを1つのバンドルにする。
 * 取り込んだ外部予定は含めない。お気に入りシフトのテンプレは Epic 4 で追加する。
 *
 * データ取得は `listCalendars` / `listEvents` を再利用する(オフライン時はキャッシュに
 * フォールバックする分岐がそこに閉じているため。Story 1.6)。
 */

export interface ExportBundle {
  app: 'calendar-app';
  schemaVersion: 1;
  /** 書き出した時刻(UTC ISO)。 */
  exportedAt: string;
  calendars: Calendar[];
  events: EventItem[];
}

function eventKey(e: EventItem): string {
  return e.startsAt ?? e.eventDate ?? '';
}

export async function buildExportBundle(): Promise<Result<ExportBundle>> {
  const calendars = await listCalendars();
  if (!calendars.ok) return err(calendars.error);
  const events = await listEvents();
  if (!events.ok) return err(events.error);

  const localCalendars = calendars.value
    .filter((c) => c.source === 'local')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const localIds = new Set(localCalendars.map((c) => c.id));

  return ok({
    app: 'calendar-app',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    calendars: localCalendars,
    // ローカル予定のうち、書き出すカレンダーに属すものだけ(削除済みカレンダーの
    // 取り残しを含めず、バンドルの参照を自己完結させる)。
    events: events.value
      .filter((e) => e.source === 'local' && localIds.has(e.calendarId))
      .sort((a, b) => eventKey(a).localeCompare(eventKey(b))),
  });
}
