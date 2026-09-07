import { listOutbox, removeOutbox } from './outbox';
import { cachePut, cacheRekey } from './cache';
import { isNetworkError } from './net';
import type { OutboxItem } from './local-db';
import type { Result } from './result';
import {
  createCalendar,
  deleteCalendar,
  recolorCalendar,
  renameCalendar,
  setCalendarVisible,
} from './calendars';
import { createEvent, deleteEvent, updateEvent } from './events';
import type { EventPatch, NewEventInput } from './events';
import type { NewCalendarInput } from './calendars';

/**
 * オフライン中に溜めた `outbox` を、オンライン復帰時に `seq` 昇順で再生する(AD-9)。
 * v1 は単一ユーザー・後勝ち(ARCHITECTURE Deferred): 恒久エラーの項目は破棄し先へ進む。
 * ネットワーク障害が出たら中断し、次の `online` で再試行する。
 */

export interface FlushResult {
  flushed: number;
  /** 恒久エラーで破棄した項目数(> 0 なら UI に一度だけ通知)。 */
  dropped: number;
  /** ネットワーク障害で途中中断したか。 */
  interrupted: boolean;
}

async function replay(
  item: OutboxItem,
  targetId: string,
  idMap: Map<string, string>,
): Promise<Result<unknown>> {
  if (item.entity === 'event') {
    switch (item.op) {
      case 'create': {
        const r = await createEvent(item.payload as NewEventInput);
        if (r.ok) {
          idMap.set(item.targetId, r.value.id);
          await cacheRekey('events', item.targetId, r.value);
        }
        return r;
      }
      case 'update': {
        const r = await updateEvent({ id: targetId, source: 'local' }, item.payload as EventPatch);
        if (r.ok) await cachePut('events', r.value);
        return r;
      }
      case 'delete':
        return deleteEvent({ id: targetId, source: 'local' });
      default:
        return { ok: true, value: undefined };
    }
  }

  switch (item.op) {
    case 'create': {
      const r = await createCalendar(item.payload as NewCalendarInput);
      if (r.ok) {
        idMap.set(item.targetId, r.value.id);
        await cacheRekey('calendars', item.targetId, r.value);
      }
      return r;
    }
    case 'rename': {
      const r = await renameCalendar(targetId, (item.payload as { name: string }).name);
      if (r.ok) await cachePut('calendars', r.value);
      return r;
    }
    case 'recolor': {
      const r = await recolorCalendar(targetId, (item.payload as { color: string }).color);
      if (r.ok) await cachePut('calendars', r.value);
      return r;
    }
    case 'setVisible': {
      const r = await setCalendarVisible(
        targetId,
        (item.payload as { isVisible: boolean }).isVisible,
      );
      if (r.ok) await cachePut('calendars', r.value);
      return r;
    }
    case 'delete':
      return deleteCalendar({ id: targetId, isShift: false });
    default:
      return { ok: true, value: undefined };
  }
}

export async function flushOutbox(): Promise<FlushResult> {
  const items = await listOutbox();
  const idMap = new Map<string, string>();
  let flushed = 0;
  let dropped = 0;

  for (const item of items) {
    const targetId = idMap.get(item.targetId) ?? item.targetId;
    let result: Result<unknown>;
    try {
      result = await replay(item, targetId, idMap);
    } catch (e) {
      if (isNetworkError(e)) return { flushed, dropped, interrupted: true };
      await removeOutbox(item.seq);
      dropped += 1;
      continue;
    }
    if (result.ok) {
      await removeOutbox(item.seq);
      flushed += 1;
    } else if (isNetworkError(result.error.cause) || result.error.kind === 'data/offline') {
      return { flushed, dropped, interrupted: true };
    } else {
      // 恒久エラー(対象消失・制約違反など)→ 破棄して継続(v1 後勝ち)。
      await removeOutbox(item.seq);
      dropped += 1;
    }
  }
  return { flushed, dropped, interrupted: false };
}
