import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service Worker の更新プロンプトと「オフラインでも使えます」の一度きりの告知。
 * `registerType: 'prompt'` なので更新はユーザーに委ねる(トーン規約: 催促しない)。
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-2xl px-4">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border-hairline bg-surface-raised px-3 py-2 text-meta shadow-lg">
        {needRefresh ? (
          <>
            <span className="text-ink-primary">新しいバージョンがあります</span>
            <span className="flex flex-none gap-3">
              <button
                type="button"
                onClick={() => void updateServiceWorker(true)}
                className="font-semibold text-accent"
              >
                更新
              </button>
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="text-ink-secondary"
              >
                閉じる
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="text-ink-secondary">オフラインでも使えます</span>
            <button
              type="button"
              onClick={() => setOfflineReady(false)}
              className="flex-none text-accent"
            >
              閉じる
            </button>
          </>
        )}
      </div>
    </div>
  );
}
