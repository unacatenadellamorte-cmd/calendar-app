import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth-context';
import { useOnline } from '@/app/online-context';
import { env } from '@/data/env';
import { resolveMessage } from '@/data/messages';
import {
  disconnectGoogle,
  getDisconnectImpact,
  startGoogleConnect,
  type DisconnectImpact,
} from '@/data/connections';
import { listSyncState } from '@/data/google-sync';
import { formatEventTime } from '@/lib/datetime';
import { useGoogleConnection } from '@/features/connections/model/useGoogleConnection';
import { useGoogleSync } from '@/features/connections/model/useGoogleSync';
import { DisconnectSheet } from './DisconnectSheet';

/**
 * 設定画面の「カレンダー接続」欄(Story 3.1 / 3.3 / 3.4)。
 * 状態別:
 *  - unavailable / OAuth 未設定: 無効表示
 *  - guest:          ログインへ誘導
 *  - authenticated:  接続中なら email + 取り込むカレンダー導線 + 「今すぐ取り込み」+「接続を解除」、未接続なら「Google を接続」
 */
export function ConnectionsSection() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const { refetch } = useOnline();
  const { connection, loading, errorKey, refresh } = useGoogleConnection(
    env.hasSupabase && env.hasGoogleOauth,
  );
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);

  // 接続解除の確認シート(Story 3.4)。
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [impact, setImpact] = useState<DisconnectImpact | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectErrorKey, setDisconnectErrorKey] = useState<string | null>(null);
  const [disconnectedLine, setDisconnectedLine] = useState<string | null>(null);

  const openDisconnect = () => {
    if (!connection) return;
    setImpact(null);
    setDisconnectErrorKey(null);
    setDisconnectOpen(true);
    void getDisconnectImpact(connection.id).then((r) => {
      if (r.ok) setImpact(r.value);
    });
  };

  const confirmDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectErrorKey(null);
    const result = await disconnectGoogle();
    setDisconnecting(false);
    if (!result.ok) {
      setDisconnectErrorKey(result.error.messageKey);
      return;
    }
    setDisconnectOpen(false);
    setDisconnectedLine(
      `接続を解除しました(予定 ${result.value.events} 件を削除)`,
    );
    refresh();
    refetch();
  };

  // 取り込み状態(全体の最終取り込み時刻)。取り込み後に取り直す。
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const reloadSyncState = useCallback(async () => {
    const result = await listSyncState();
    if (!result.ok) return;
    let latest: string | null = null;
    for (const s of result.value) {
      if (s.lastSyncedAt && (!latest || Date.parse(s.lastSyncedAt) > Date.parse(latest))) {
        latest = s.lastSyncedAt;
      }
    }
    setLastSyncedAt(latest);
  }, []);
  // 取り込み成功後は sync_state の表示を取り直し、かつ月/週/リストの予定も
  // 取り直す(refetch = syncNonce を bump。useEvents / useCalendars が追随)。
  const onSyncDone = useCallback(() => {
    void reloadSyncState();
    refetch();
  }, [reloadSyncState, refetch]);
  const { syncing, lastRun, errorKey: syncErrorKey, runSync } = useGoogleSync(onSyncDone);

  useEffect(() => {
    if (connection) void reloadSyncState();
  }, [connection, reloadSyncState]);

  const onConnect = () => {
    setActionErrorKey(null);
    const result = startGoogleConnect();
    // 成功時はページ遷移するので返らない。返ってきたら失敗(遷移していない)。
    if (result && !result.ok) setActionErrorKey(result.error.messageKey);
  };

  const runResultLine = (() => {
    if (!lastRun) return null;
    const added = lastRun.synced.reduce((n, s) => n + s.upserted, 0);
    if (lastRun.errors.length > 0) {
      return `一部のカレンダーを取り込めませんでした(${lastRun.errors.length} 件)`;
    }
    return `取り込みました(${added} 件)`;
  })();

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

            <button
              type="button"
              onClick={() => void runSync()}
              disabled={syncing}
              className="mt-2 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
            >
              {syncing ? '取り込み中…' : '今すぐ取り込み'}
            </button>

            <p className="mt-2 text-meta text-ink-secondary">
              {lastSyncedAt
                ? `最終取り込み: ${formatEventTime(lastSyncedAt)}`
                : 'まだ取り込んでいません'}
            </p>

            {syncErrorKey ? (
              <p role="alert" className="mt-1 text-meta text-danger">
                {resolveMessage(syncErrorKey)}
              </p>
            ) : (
              runResultLine && (
                <p role="status" className="mt-1 text-meta text-ink-secondary">
                  {runResultLine}
                </p>
              )
            )}

            <button
              type="button"
              onClick={openDisconnect}
              className="mt-3 min-h-11 w-full rounded-sm px-4 text-meta text-danger"
            >
              接続を解除
            </button>
          </>
        ) : (
          <>
            <p className="text-body text-ink-primary">Google カレンダーを接続</p>
            <p className="mt-1 text-meta text-ink-secondary">
              選んだカレンダーを読み取り専用で取り込みます。
            </p>
            {disconnectedLine && (
              <p role="status" className="mt-1 text-meta text-ink-secondary">
                {disconnectedLine}
              </p>
            )}
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

      <DisconnectSheet
        open={disconnectOpen}
        impact={impact}
        busy={disconnecting}
        errorKey={disconnectErrorKey}
        onConfirm={() => void confirmDisconnect()}
        onClose={() => setDisconnectOpen(false)}
      />
    </section>
  );
}
