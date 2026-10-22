import { t } from '@/i18n';
import type { PurchasablePlan } from '@/data/entitlements';

/**
 * 有料プランの定義(CAP-5)。UI はここだけを参照し、価格を各所にハードコードしない。
 *
 * 価格について: 現在の金額は **仮表示**。RevenueCat 導入後はオファリングから取得した
 * ストアのローカライズ済み価格(`{ kind: 'store' }`)に差し替える(SPEC CAP-1:
 * アプリ内に金額をハードコードしない)。税込/税別・最終金額は各ストアの設定に従う。
 */

/** 表示用の価格。`placeholder` は RevenueCat 導入までの仮表示であることを型で区別する。 */
export type PlanPrice =
  | {
      kind: 'placeholder';
      /** 仮の月額(日本円)。ストアの実価格ではない。 */
      amountJpy: number;
    }
  | {
      kind: 'store';
      /** ストア(RevenueCat オファリング)から取得したローカライズ済みの価格文字列。 */
      localizedPrice: string;
    };

export interface PlanDefinition {
  /** 購入で付く権利。entitlements.entitlement と同じ名前。 */
  id: PurchasablePlan;
  /** プラン名(t() の原文キー)。 */
  title: string;
  /** 機能の説明(t() の原文キー)。できることだけを具体的に書き、誇張しない。 */
  features: readonly string[];
  price: PlanPrice;
}

export const PLANS: readonly PlanDefinition[] = [
  {
    id: 'device_photos',
    title: '写真表示',
    features: [
      '選んだ日に撮影した端末の写真をカレンダーに表示します。',
      '写真は端末内だけで読み取り、サーバーへ送信しません。',
    ],
    price: { kind: 'placeholder', amountJpy: 500 },
  },
  {
    id: 'multi_account',
    title: '複数アカウント',
    features: [
      'Google アカウントを2つ以上接続して、それぞれのカレンダーを取り込めます。',
      '写真表示も含みます。',
    ],
    price: { kind: 'placeholder', amountJpy: 1000 },
  },
];

/** 価格の表示文字列。仮表示のあいだは「(仮)」を付けて実価格と誤認させない。 */
export function formatPlanPrice(price: PlanPrice): string {
  if (price.kind === 'store') return t('{0} / 月', [price.localizedPrice]);
  return t('{0} / 月(仮の表示)', [`¥${price.amountJpy.toLocaleString('ja-JP')}`]);
}
