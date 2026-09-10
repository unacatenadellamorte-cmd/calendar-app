/**
 * カレンダーの色プリセット。DESIGN.md §Colors「色覚に配慮した10色前後のプリセット」に基づく。
 * Okabe-Ito の色覚バリアフリーパレットを土台にした 8 色。
 * hex は必ず #RRGGBB(大文字)。予定チップは「色バー + カレンダー名」をセットで表示するので、
 * 色だけで区別できなくても運用は成り立つ(EXPERIENCE.md Accessibility Floor)。
 */

export interface CalendarColor {
  id: string;
  name: string;
  hex: string;
}

export const CALENDAR_COLORS: readonly CalendarColor[] = [
  { id: 'vermillion', name: '朱', hex: '#D55E00' },
  { id: 'blue', name: '青', hex: '#0072B2' },
  { id: 'green', name: '緑', hex: '#009E73' },
  { id: 'purple', name: '紫', hex: '#CC79A7' },
  { id: 'orange', name: '橙', hex: '#E69F00' },
  { id: 'sky', name: '空', hex: '#56B4E9' },
  { id: 'indigo', name: '藍', hex: '#3B4CC0' },
  { id: 'rose', name: '桃', hex: '#D81B60' },
] as const;

/** シフト用カレンダーの既定色(緑)。 */
export const SHIFT_CALENDAR_COLOR = '#009E73';

/** 取り込んだ外部カレンダーで色が取れなかったときの既定色(灰)。 */
export const EXTERNAL_DEFAULT_COLOR = '#7A7A7A';

/**
 * 外部サービス(Google 等)由来の色文字列を `#RRGGBB`(大文字)に正規化する。
 * `#RGB` は各桁を2倍に展開。`#RRGGBB` はそのまま大文字化。
 * それ以外(名前付き色・rgb()・null・undefined)は既定色。
 * `calendars.color` の CHECK(`^#[0-9A-Fa-f]{6}$`)を必ず満たす戻り値。
 */
export function normalizeHexColor(input: string | null | undefined): string {
  if (typeof input !== 'string') return EXTERNAL_DEFAULT_COLOR;
  const value = input.trim();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
  return EXTERNAL_DEFAULT_COLOR;
}

const PRESET_HEXES = new Set(CALENDAR_COLORS.map((c) => c.hex));

/** プリセットに含まれる色か(大文字小文字を無視)。 */
export function isPresetColor(hex: string): boolean {
  return PRESET_HEXES.has(hex.toUpperCase());
}

/** 一覧内で未使用のプリセット色を返す(全て使用済みなら先頭)。 */
export function nextUnusedColor(usedHexes: readonly string[]): string {
  const used = new Set(usedHexes.map((h) => h.toUpperCase()));
  const free = CALENDAR_COLORS.find((c) => !used.has(c.hex));
  return (free ?? CALENDAR_COLORS[0]!).hex;
}
