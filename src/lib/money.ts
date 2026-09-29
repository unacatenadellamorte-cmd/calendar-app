import { getLocale } from '@/i18n';
/** 金額の表示ヘルパ。円のみ(v1)。 */

/** 数値を「¥62,700」形式にする。負値もそのまま(呼び出し側で 0 クランプ済み想定)。 */
export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString(getLocale())}`;
}
