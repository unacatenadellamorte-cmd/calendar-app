import { cacheDelete, cacheGetAll, cachePut } from './cache';
import { dropOutboxFor, enqueue } from './outbox';
import { appError, err, ok, type Result } from './result';
import type { Calendar } from './calendars';
import type { EventItem, EventPatch, NewEventInput } from './events';

/**
 * data-access レイヤのオフライン分岐(AD-9)。
 * ミューテーションを `outbox` に積み、表示キャッシュを楽観更新し、楽観行を `ok` で返す。
 * 実際のサーバー反映は復帰時に `sync.flushOutbox()` が行う。
 */

const nowIso = () => new Date().toISOString();

/** オフライン作成の id はクライアントで発番する(v4 UUID。フラッシュ時も同じ id を使う)。 */
export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 古いブラウザ向けフォールバック(PWA 対象ブラウザではほぼ到達しない)。
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function cachedEvent(id: string): Promise<EventItem | undefined> {
  return (await cacheGetAll('events')).find((e) => e.id === id);
}
async function cachedCalendar(id: string): Promise<Calendar | undefined> {
  return (await cacheGetAll('calendars')).find((c) => c.id === id);
}

// --- events ---

export async function offlineCreateEvent(
  id: string,
  input: NewEventInput,
): Promise<Result<EventItem>> {
  const row: EventItem = {
    id,
    calendarId: input.calendarId,
    title: input.title.trim(),
    allDay: input.allDay,
    startsAt: input.allDay ? null : input.startsAt,
    endsAt: input.allDay ? null : input.endsAt,
    eventDate: input.allDay ? input.eventDate : null,
    note: input.note?.trim() || null,
    source: 'local',
    breakMinutes: input.shift?.breakMinutes ?? null,
    hourlyWage: input.shift?.hourlyWage ?? null,
    workplaceLabel: input.shift?.workplaceLabel ?? null,
    shiftTemplateId: input.shift?.shiftTemplateId ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await enqueue({ entity: 'event', op: 'create', targetId: id, payload: { ...input, id } });
  await cachePut('events', row);
  return ok(row);
}

export async function offlineUpdateEvent(
  id: string,
  patch: EventPatch,
): Promise<Result<EventItem>> {
  const current = await cachedEvent(id);
  if (!current) return err(appError('data/offline', 'data/offline'));
  const merged: EventItem = { ...current, ...dropUndefined(patch), updatedAt: nowIso() };
  await enqueue({ entity: 'event', op: 'update', targetId: id, payload: patch });
  await cachePut('events', merged);
  return ok(merged);
}

export async function offlineDeleteEvent(id: string): Promise<Result<void>> {
  await enqueue({ entity: 'event', op: 'delete', targetId: id });
  await cacheDelete('events', id);
  return ok(undefined);
}

export async function offlineRestoreEvent(event: EventItem): Promise<Result<void>> {
  await dropOutboxFor('event', event.id, 'delete');
  await cachePut('events', event);
  return ok(undefined);
}

// --- calendars ---

export async function offlineCreateCalendar(
  id: string,
  input: { name: string; color: string },
): Promise<Result<Calendar>> {
  const existing = await cacheGetAll('calendars');
  const nextPriority = existing.reduce((max, c) => Math.max(max, c.priority), -1) + 1;
  const row: Calendar = {
    id,
    name: input.name.trim(),
    color: input.color,
    source: 'local',
    isShift: false,
    isVisible: true,
    priority: nextPriority,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await enqueue({ entity: 'calendar', op: 'create', targetId: id, payload: { ...input, id } });
  await cachePut('calendars', row);
  return ok(row);
}

/**
 * オフラインでの並べ替え。楽観的にキャッシュの priority を `orderedIds` の順で 0.. に振り直し、
 * `outbox` には最新の並べ替え1件だけを残す(last-wins)。フラッシュ時に1回の RPC で適用。
 */
export async function offlineReorderCalendars(
  orderedIds: string[],
): Promise<Result<Calendar[]>> {
  const all = await cacheGetAll('calendars');
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  const reordered = all
    .map((c) => ({ ...c, priority: pos.get(c.id) ?? orderedIds.length + c.priority }))
    .sort((a, b) => a.priority - b.priority);
  for (const c of reordered) await cachePut('calendars', c);
  await dropOutboxFor('calendar', 'reorder', 'reorder');
  await enqueue({ entity: 'calendar', op: 'reorder', targetId: 'reorder', payload: { orderedIds } });
  return ok(reordered);
}

export async function offlinePatchCalendar(
  id: string,
  op: string,
  patch: Partial<Calendar>,
  payload: unknown,
): Promise<Result<Calendar>> {
  const current = await cachedCalendar(id);
  if (!current) return err(appError('data/offline', 'data/offline'));
  const merged: Calendar = { ...current, ...patch, updatedAt: nowIso() };
  await enqueue({ entity: 'calendar', op, targetId: id, payload });
  await cachePut('calendars', merged);
  return ok(merged);
}

export async function offlineDeleteCalendar(id: string): Promise<Result<void>> {
  await enqueue({ entity: 'calendar', op: 'delete', targetId: id });
  await cacheDelete('calendars', id);
  return ok(undefined);
}

export async function offlineRestoreCalendar(calendar: Calendar): Promise<Result<void>> {
  await dropOutboxFor('calendar', calendar.id, 'delete');
  await cachePut('calendars', calendar);
  return ok(undefined);
}

function dropUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
