import { useEffect, useRef } from 'react';
import { useAuth } from '@/app/auth-context';
import { onAppResume } from '@/platform/appLifecycle';
import { syncDeviceCalendarsNow } from '@/data/device-sync';
import { notifyDataRefresh } from '@/app/data-refresh-notification';

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
  const { session, state } = useAuth();
  const generation = useRef(0);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    let active = true;
    const current = ++generation.current;
    const unsubscribe = onAppResume(() => {
      if (state !== 'guest' && state !== 'authenticated') return;
      void (async () => {
        try {
          const result = await syncDeviceCalendarsNow();
          if (active && current === generation.current && userId === (session?.user.id ?? null) && result.ok) notifyDataRefresh();
        } catch {
          // 復帰時の自動取込失敗は画面を妨げず、次回復帰時に再試行する。
        }
      })();
    });
    return () => { active = false; generation.current += 1; unsubscribe(); };
  }, [session?.user.id, state, userId]);
  return null;
}
