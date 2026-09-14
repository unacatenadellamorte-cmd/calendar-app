import { useEffect } from 'react';
import { onAppResume } from '@/platform/appLifecycle';
import { syncDeviceCalendarsNow } from '@/data/device-sync';

/**
 * フォアグラウンド復帰のたびに端末カレンダーを取り込む、非表示コンポーネント
 * (Story 5.3)。UI は持たず常に `null` を返す。`src/main.tsx` で
 * `<DeepLinkListener />` と並べて配置する。
 *
 * 未接続 / 選択済みカレンダーが無い場合は `syncDeviceCalendarsNow` 側が
 * 何もせず正常終了するため、ここでは呼ぶだけでよい。結果の表示は
 * 設定画面(`ConnectionsSection`)の「今すぐ取り込み」ボタン側の責務。
 */
export function DeviceSyncOnResume() {
  useEffect(() => onAppResume(() => void syncDeviceCalendarsNow()), []);
  return null;
}
