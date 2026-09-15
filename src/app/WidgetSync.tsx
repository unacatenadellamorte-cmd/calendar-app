import { useEffect } from 'react';
import { onAppResume } from '@/platform/appLifecycle';
import { refreshFeaturedWidget } from '@/platform/widget';

/**
 * フォアグラウンド復帰のたびにホーム画面ウィジェットを最新化する、非表示コンポーネント
 * (Story 5.6)。`DeviceSyncOnResume.tsx` と同型 ── UI は持たず常に `null` を返す。
 * `src/main.tsx` で `<DeviceSyncOnResume />` と並べて配置する。
 *
 * `refreshFeaturedWidget` 自体が Web(非ネイティブ)での早期リターンと失敗時の
 * 警告ログのみ(投げない)を担うため、ここでは呼ぶだけでよい。
 */
export function WidgetSync() {
  useEffect(() => onAppResume(() => void refreshFeaturedWidget()), []);
  return null;
}
