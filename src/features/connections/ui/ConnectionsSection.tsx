import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth-context';
import { env } from '@/data/env';
import { resolveMessage } from '@/data/messages';
import { startGoogleConnect } from '@/data/connections';
import { useGoogleConnection } from '@/features/connections/model/useGoogleConnection';

/**
 * 設定画面の「カレンダー接続」欄(Story 3.1)。
 * 状態別:
 *  - unavailable / OAuth 未設定: 無効表示
 *  - guest:          ログインへ誘導
 *  - authenticated:  接続中なら email 表示、未接続なら「Google を接続」
 * 取り込むカレンダーの選択は Story 3.2。
 */
export function ConnectionsSection() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const { connection, loading, errorKey } = useGoogleConnection(
    env.hasSupabase && env.hasGoogleOauth,
  );
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);

  const onConnect = () => {
    setActionErrorKey(null);
    const result = startGoogleConnect();
    // 成功時はページ遷移するので返らない。返ってきたら失敗(遷移していない)。
    if (result && !result.ok) setActionErrorKey(result.error.messageKey);
  };

  return (
    <section aria-labelledby="connections-heading" className="mt-6">
      <h2 id="connections-heading" className="text-body font-semibold text-ink-primary">
        カレンダー接続
      </h2>
      <div className="mt-3 rounded-md border border-border-hairline bg-surface-raised p-4">
        {state === 'unavailable' || !env.hasSupabase ? (
          <p className="text-meta text-ink-secondary">
            Supabase を設定すると、Google カレンダーを接続できます。
          </p>
        ) : !env.hasGoogleOauth ? (
          <p className="text-meta text-ink-secondary">
            Google カレンダー接続はまだ設定されていません。
          </p>
        ) : state === 'loading' ? (
          <p className="text-meta text-ink-secondary">読み込み中…</p>
        ) : state === 'guest' ? (
          <>
            <p className="text-body text-ink-primary">Google カレンダーを接続できます</p>
            <p className="mt-1 text-meta text-ink-secondary">
              接続にはログインが必要です。
            </p>
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
            >
              ログインして接続
            </button>
          </>
        ) : loading ? (
          <p className="text-meta text-ink-secondary">読み込み中…</p>
        ) : connection ? (
          <>
            <p className="text-meta text-ink-secondary">Google に接続中</p>
            <p className="mt-1 text-body text-ink-primary">
              {connection.googleEmail ?? 'Google カレンダー'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/connections/google/calendars')}
              className="mt-3 flex min-h-11 w-full items-center justify-between rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
            >
              取り込むカレンダーを選ぶ
              <span aria-hidden="true" className="text-ink-secondary">
                ›
              </span>
            </button>
          </>
        ) : (
          <>
            <p className="text-body text-ink-primary">Google カレンダーを接続</p>
            <p className="mt-1 text-meta text-ink-secondary">
              選んだカレンダーを読み取り専用で取り込みます。
            </p>
            <button
              type="button"
              onClick={onConnect}
              className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
            >
              Google を接続
            </button>
          </>
        )}

        {(actionErrorKey ?? errorKey) && (
          <p role="alert" className="mt-2 text-meta text-danger">
            {resolveMessage(actionErrorKey ?? errorKey!)}
          </p>
        )}
      </div>
    </section>
  );
}
