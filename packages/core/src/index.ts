/**
 * @calendar-app/core — 純粋ドメイン
 *
 * このパッケージは何も import しない(標準ライブラリのみ)。
 * フロント(src/)と将来の Supabase Edge Function が同じコードを共有する。
 * 依存方向: どのレイヤからも import されてよいが、ここからは何も import しない(ARCHITECTURE-SPINE AD-10)。
 *
 * 後続ストーリーで実装:
 *  - pay-calc: 実働時間・給料見込み (Epic 4: Story 4.3 / 4.4)
 */

export {
  byPriorityValue,
  compareEventsForList,
  type OrderableEvent,
  type PriorityLookup,
} from './priority';

export { selectFeaturedEvents, type FeaturableEvent } from './featured';

/** このパッケージのバージョン識別子(ビルド疎通確認用のプレースホルダ)。 */
export const CORE_VERSION = '0.1.0' as const;

/**
 * 分を「H時間M分」の表示文字列にする最小のユーティリティ。
 * pay-calc(Story 4.3)で実働時間の表示に使う想定の足がかり。副作用なし。
 */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new RangeError('totalMinutes は 0 以上の有限数である必要があります');
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}時間${minutes}分`;
}
