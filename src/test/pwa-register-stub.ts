/**
 * テスト用スタブ。`virtual:pwa-register/react` は vitest では解決できないため、
 * `vite.config.ts` の `test.alias` でこのモジュールへ差し替える。
 */
import { useState } from 'react';

type Setter = (value: boolean) => void;

export function useRegisterSW(_options?: unknown): {
  needRefresh: [boolean, Setter];
  offlineReady: [boolean, Setter];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh: needRefresh as [boolean, Setter],
    offlineReady: offlineReady as [boolean, Setter],
    updateServiceWorker: async () => {},
  };
}
