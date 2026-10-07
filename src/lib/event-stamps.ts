/** タグと予定に保存する安全な固定ID。表示値やSVGをIDとして保存しない。 */
export const EVENT_STAMPS = [
  ['work', '仕事', 'M10 3h4v3h4a2 2 0 0 1 2 2v11H4V8a2 2 0 0 1 2-2h4V3Zm0 3h4'],
  [
    'meeting',
    '会議',
    'M5 4h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm13 4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2v3l-4-3h-4a2 2 0 0 1-2-2',
  ],
  [
    'school',
    '学校',
    'M3 5h11v15H3zM6 5V3m5 2V3m-5 6h4m-4 4h4m-4 4h4m7-1 4-10 2 1-4 10-3 2 1-3Z',
  ],
  ['study', '勉強', 'M3 6q5-3 9 0v14q-4-3-9 0V6Zm18 0q-5-3-9 0v14q4-3 9 0V6Z'],
  ['morning', '早番', 'M3 16a9 9 0 0 1 18 0M2 19h20M12 2v3M4.5 6.5l2 2m11-2-2 2'],
  [
    'late',
    '遅番',
    'M2 16a8 8 0 0 1 12-7M1 19h8M10 2v3M3 6l2 2M17 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2v3l2 1',
  ],
  ['night', '夜勤', 'M16 3a9 9 0 1 0 5 15A8 8 0 0 1 16 3Z'],
  ['overtime', '残業', 'M12 3a9 9 0 1 0 .01 0ZM12 7v5l-3 2'],
  [
    'holiday',
    '休日',
    'M9 19H6a4 4 0 0 1-4-4v-3l1-4 3 2 3-2 1 4c2-5 10-5 12 1 1 4-2 7-6 7h-5c-3 0-4-2-3-4s5-2 6 0',
  ],
  ['home', '在宅', 'm3 11 9-8 9 8M5 10v10h14V10m-9 10v-6h4v6'],
  ['chores', '家事', 'm14 3-8 12 5 2 7-12a2 2 0 0 0-4-2ZM5 15l-2 5 5-2'],
  ['trash', 'ごみ出し', 'M4 7h16l-1 14H5L4 7Zm-1-3h18M9 4V2h6v2m-7 7v6m4-6v6m4-6v6'],
  ['shopping', '買い物', 'M5 8h14l-1 13H6L5 8Zm4 0V5a3 3 0 0 1 6 0v3'],
  ['payment', '支払い', 'M3 6h18v13H3zM3 10h18m-5 5h2'],
  ['meal', 'ごはん', 'M3 10q9-4 18 0l-2 7q-7 5-14 0L3 10Zm1 2q8 3 16 0M13 2l7 5M16 1l7 5'],
  [
    'cafe',
    'カフェ',
    'M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 2h2a3 3 0 0 1 0 6h-2M7 3v3m4-3v3',
  ],
  ['drinks', '飲み会', 'M4 7h7v11H4zM13 7h7v11h-7zM7 4v3m10-3v3M2 10l2-2m16 0 2 2'],
  [
    'travel',
    '旅行',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0h10a2 2 0 0 1 2 2v11H5V8a2 2 0 0 1 2-2Zm2 0v13m6-13v13M8 21h.01m8-.01h.01',
  ],
  ['car', '車', 'M3 14l2-6h14l2 6v5h-3v-2H6v2H3v-5Zm3-6 2-4h8l3 4M6 13h.01M18 13h.01'],
  ['train', '電車', 'M6 3h12v14H6zM6 8h12m-9 5h.01m6-.01h.01M8 17l-2 4m10-4 2 4'],
  ['hospital', '通院', 'M4 5h16v16H4zM10 8h4v3h3v4h-3v3h-4v-3H7v-4h3z'],
  [
    'dentist',
    '歯医者',
    'M12 4c-3-3-8-1-8 4 0 3 2 4 2 8 0 3 2 4 3 1l2-5 2 5c1 3 3 2 3-1 0-4 2-5 2-8 0-5-5-7-8-4Z',
  ],
  ['medicine', '服薬', 'M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0Zm2-9 7 7'],
  [
    'salon',
    '美容院',
    'M5 4l14 16M19 4 5 20M3 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm14 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
  ],
  ['exercise', '運動', 'M3 9h3v6H3zM18 9h3v6h-3zM6 11h12v2H6zM9 8v8m6-8v8'],
  ['walk', '散歩', 'M4 15l3-8 4 2 3-2 6 4-2 4-5-2-4 4-5-2Zm3-8 2-3 3 2'],
  [
    'pickup',
    '送迎',
    'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9v-3a6 6 0 0 1 12 0v3m5-5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-1 2a4 4 0 0 1 4 4',
  ],
  [
    'pet',
    'ペット',
    'M5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-7 10c-5 0-8-3-7-6 1-4 5-2 7 0 2-2 6-4 7 0 1 3-2 6-7 6Z',
  ],
  [
    'birthday',
    '記念日',
    'M3 11h18v10H3zM2 11h20M12 11V5m0 0c-2-2 0-4 1-4 1 1 2 3-1 4m-6 6v3m6-3v3m6-3v3',
  ],
  ['date', 'デート', 'M12 20s-9-5-9-12a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 7-7 12-7 12Z'],
  [
    'music',
    '音楽',
    'M10 18V5l10-2v13m-10 2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
  ],
  ['movie', '映画', 'M3 4h18v16H3zM3 9h18M7 4l3 5m4-5 3 5M7 15l3 5m4-5 3 5'],
] as const;

export type EventStampId = (typeof EVENT_STAMPS)[number][0];
export const EVENT_STAMP_IDS: readonly EventStampId[] = EVENT_STAMPS.map(([id]) => id);
export function isEventStampId(value: unknown): value is EventStampId {
  return typeof value === 'string' && EVENT_STAMP_IDS.includes(value as EventStampId);
}
export function eventStampName(id: EventStampId): string {
  return EVENT_STAMPS.find(([key]) => key === id)?.[1] ?? '';
}
