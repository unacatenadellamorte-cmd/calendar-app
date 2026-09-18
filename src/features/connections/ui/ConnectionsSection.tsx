import { t, useLanguage } from '@/i18n';
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
import { connectDevice, disconnectDevice } from '@/data/device-connections';
import { isDeviceCalendarSupported } from '@/platform/deviceCalendar';
import { formatEventTime } from '@/lib/datetime';
import { useGoogleConnection } from '@/features/connections/model/useGoogleConnection';
import { useGoogleSync } from '@/features/connections/model/useGoogleSync';
import { useDeviceConnection } from '@/features/connections/model/useDeviceConnection';
import { useDeviceSync } from '@/features/connections/model/useDeviceSync';
import { DisconnectSheet } from './DisconnectSheet';
/** Google/端末で共通の「今すぐ取り込み」結果表示(構造だけ見るので型は共有しない)。 */
interface SyncResultLike {
  synced: {
    upserted: number;
  }[];
  errors: unknown[];
}
/**
 * 「今すぐ取り込み」の結果を1行に整形する。全カレンダーが失敗した場合(`synced` が
 * 空)は「一部」ではなく明確に失敗したと伝える。
 */
function formatSyncResultLine(result: SyncResultLike | null): string | null {
  if (!result) return null;
  if (result.errors.length > 0) {
    if (result.synced.length === 0) return t('取り込みに失敗しました');
    return t('一部のカレンダーを取り込めませんでした({0} 件)', [result.errors.length]);
  }
  const added = result.synced.reduce((n, s) => n + s.upserted, 0);
  return t('取り込みました({0} 件)', [added]);
}
/**
 * 設定画面の「カレンダー接続」欄(Story 3.1 / 3.3 / 3.4 / 5.2 / 5.3)。
 * 状態別:
 *  - unavailable / OAuth 未設定: 無効表示
 *  - guest:          ログインへ誘導
 *  - authenticated:  接続中なら email + 取り込むカレンダー導線 + 「今すぐ取り込み」+「接続を解除」、未接続なら「Google を接続」
 * 端末カレンダーブロックも同じパターン(取り込み・解除は Story 5.3)。
 */
export function ConnectionsSection() {
  useLanguage();
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
    setDisconnectedLine(t('接続を解除しました(予定 {0} 件を削除)', [result.value.events]));
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
  const startGoogleSync = () => {
    setActionErrorKey(null);
    void runSync();
  };
  useEffect(() => {
    if (connection) void reloadSyncState();
  }, [connection, reloadSyncState]);
  const onConnect = () => {
    setActionErrorKey(null);
    const result = startGoogleConnect();
    // 成功時はページ遷移するので返らない。返ってきたら失敗(遷移していない)。
    if (result && !result.ok) setActionErrorKey(result.error.messageKey);
  };
  // 端末カレンダー接続(Story 5.2)。OAuth を持たないため env.hasGoogleOauth には依存しない。
  // Web/PWA ビルドでは機能自体が原理的に成立しないため、ブロックごと出さない。
  const deviceSupported = isDeviceCalendarSupported();
  const {
    connection: deviceConnection,
    loading: deviceLoading,
    errorKey: deviceLoadErrorKey,
    refresh: refreshDevice,
  } = useDeviceConnection(deviceSupported && env.hasSupabase);
  const [deviceActionErrorKey, setDeviceActionErrorKey] = useState<string | null>(null);
  const [deviceDenied, setDeviceDenied] = useState(false);
  const [deviceConnecting, setDeviceConnecting] = useState(false);
  const onConnectDevice = async () => {
    setDeviceActionErrorKey(null);
    setDeviceConnecting(true);
    const result = await connectDevice();
    setDeviceConnecting(false);
    if (!result.ok) {
      setDeviceActionErrorKey(result.error.messageKey);
      if (result.error.kind === 'connection/permission-denied') setDeviceDenied(true);
      return;
    }
    setDeviceDenied(false);
    refreshDevice();
  };
  const runResultLine = formatSyncResultLine(lastRun);
  // 端末カレンダーの「今すぐ取り込み」(Story 5.3)。フォアグラウンド復帰時の自動取り込みは
  // src/app/DeviceSyncOnResume.tsx。成功したら月/週/リストの予定を取り直す(refetch)。
  const onDeviceSyncDone = useCallback(() => {
    refetch();
  }, [refetch]);
  const {
    syncing: deviceSyncing,
    lastRun: deviceLastRun,
    errorKey: deviceSyncErrorKey,
    runSync: runDeviceSync,
  } = useDeviceSync(onDeviceSyncDone);
  const deviceRunResultLine = formatSyncResultLine(deviceLastRun);
  // 端末カレンダー接続の解除(Story 5.3)。Google と同じ確認シートを再利用する。
  const [deviceDisconnectOpen, setDeviceDisconnectOpen] = useState(false);
  const [deviceImpact, setDeviceImpact] = useState<DisconnectImpact | null>(null);
  const [deviceDisconnecting, setDeviceDisconnecting] = useState(false);
  const [deviceDisconnectErrorKey, setDeviceDisconnectErrorKey] = useState<string | null>(
    null,
  );
  const [deviceDisconnectedLine, setDeviceDisconnectedLine] = useState<string | null>(null);
  const openDeviceDisconnect = () => {
    if (!deviceConnection) return;
    setDeviceImpact(null);
    setDeviceDisconnectErrorKey(null);
    setDeviceDisconnectOpen(true);
    void getDisconnectImpact(deviceConnection.id).then((r) => {
      if (r.ok) setDeviceImpact(r.value);
    });
  };
  const confirmDeviceDisconnect = async () => {
    if (!deviceConnection) return;
    setDeviceDisconnecting(true);
    setDeviceDisconnectErrorKey(null);
    const result = await disconnectDevice(deviceConnection.id);
    setDeviceDisconnecting(false);
    if (!result.ok) {
      setDeviceDisconnectErrorKey(result.error.messageKey);
      return;
    }
    setDeviceDisconnectOpen(false);
    setDeviceDisconnectedLine(
      t('接続を解除しました(予定 {0} 件を削除)', [result.value.events]),
    );
    refreshDevice();
    refetch();
  };
  return (
    <section aria-labelledby="connections-heading" className="mt-6">
      <h2 id="connections-heading" className="text-body font-semibold text-ink-primary">
        {t('カレンダー接続')}
      </h2>
      <div className="mt-3 rounded-md border border-border-hairline bg-surface-raised p-4">
        {state === 'unavailable' || !env.hasSupabase ? (
          <p className="text-meta text-ink-secondary">
            {t('Supabase を設定すると、Google カレンダーを接続できます。')}
          </p>
        ) : !env.hasGoogleOauth ? (
          <p className="text-meta text-ink-secondary">
            {t('Google カレンダー接続はまだ設定されていません。')}
          </p>
        ) : state === 'loading' ? (
          <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
        ) : state === 'guest' ? (
          <>
            <p className="text-body text-ink-primary">
              {t('Google カレンダーを接続できます')}
            </p>
            <p className="mt-1 text-meta text-ink-secondary">
              {t('接続にはログインが必要です。')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
            >
              {t('ログインして接続')}
            </button>
          </>
        ) : loading ? (
          <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
        ) : connection ? (
          <>
            <p className="text-meta text-ink-secondary">{t('Google に接続中')}</p>
            <p className="mt-1 text-body text-ink-primary">
              {connection.googleEmail ?? t('Google カレンダー')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/connections/google/calendars')}
              className="mt-3 flex min-h-11 w-full items-center justify-between rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
            >
              {t('取り込むカレンダーを選ぶ')}
              <span aria-hidden="true" className="text-ink-secondary">
                ›
              </span>
            </button>

            <button
              type="button"
              onClick={startGoogleSync}
              disabled={syncing}
              aria-label={t('Google の今すぐ取り込み')}
              className="mt-2 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
            >
              {syncing ? t('同期中') : t('今すぐ取り込み')}
            </button>

            <p className="mt-2 text-meta text-ink-secondary">
              {lastSyncedAt
                ? t('最終取り込み: {0}', [formatEventTime(lastSyncedAt)])
                : t('まだ取り込んでいません')}
            </p>

            {syncing ? (
              <p role="status" className="mt-1 text-meta text-ink-secondary">
                {t('同期中')}
              </p>
            ) : syncErrorKey ? (
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
              aria-label={t('Google の接続を解除')}
              className="mt-3 min-h-11 w-full rounded-sm px-4 text-meta text-danger"
            >
              {t('接続を解除')}
            </button>
          </>
        ) : (
          <>
            <p className="text-body text-ink-primary">{t('Google カレンダーを接続')}</p>
            <p className="mt-1 text-meta text-ink-secondary">
              {t('選んだカレンダーを読み取り専用で取り込みます。')}
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
              {t('Google を接続')}
            </button>
          </>
        )}

        {!syncing && (actionErrorKey ?? errorKey) && (
          <p role="alert" className="mt-2 text-meta text-danger">
            {resolveMessage(actionErrorKey ?? errorKey!)}
          </p>
        )}
      </div>

      {/* 端末カレンダー(Story 5.2)。Google ブロックと並ぶ独立ブロック。Web/PWA では非表示。 */}
      {deviceSupported && (
        <div className="mt-3 rounded-md border border-border-hairline bg-surface-raised p-4">
          {state === 'unavailable' || !env.hasSupabase ? (
            <p className="text-meta text-ink-secondary">
              {t('Supabase を設定すると、端末カレンダーを接続できます。')}
            </p>
          ) : state === 'loading' ? (
            <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
          ) : state === 'guest' ? (
            <>
              <p className="text-body text-ink-primary">{t('端末カレンダーを接続できます')}</p>
              <p className="mt-1 text-meta text-ink-secondary">
                {t('接続にはログインが必要です。')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
              >
                {t('ログインして接続')}
              </button>
            </>
          ) : deviceLoading ? (
            <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
          ) : deviceConnection ? (
            <>
              <p className="text-meta text-ink-secondary">{t('端末カレンダーに接続中')}</p>
              <button
                type="button"
                onClick={() => navigate('/connections/device/calendars')}
                className="mt-3 flex min-h-11 w-full items-center justify-between rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
              >
                {t('取り込むカレンダーを選ぶ')}
                <span aria-hidden="true" className="text-ink-secondary">
                  ›
                </span>
              </button>

              <button
                type="button"
                onClick={() => void runDeviceSync()}
                disabled={deviceSyncing}
                aria-label={t('端末カレンダーの今すぐ取り込み')}
                className="mt-2 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
              >
                {deviceSyncing ? t('取り込み中…') : t('今すぐ取り込み')}
              </button>

              {deviceSyncErrorKey ? (
                <p role="alert" className="mt-1 text-meta text-danger">
                  {resolveMessage(deviceSyncErrorKey)}
                </p>
              ) : (
                deviceRunResultLine && (
                  <p role="status" className="mt-1 text-meta text-ink-secondary">
                    {deviceRunResultLine}
                  </p>
                )
              )}

              <button
                type="button"
                onClick={openDeviceDisconnect}
                aria-label={t('端末カレンダーの接続を解除')}
                className="mt-3 min-h-11 w-full rounded-sm px-4 text-meta text-danger"
              >
                {t('接続を解除')}
              </button>
            </>
          ) : (
            <>
              <p className="text-body text-ink-primary">{t('端末カレンダーを接続')}</p>
              <p className="mt-1 text-meta text-ink-secondary">
                {t('選んだカレンダーを読み取り専用で取り込みます。')}
              </p>
              {deviceDisconnectedLine && (
                <p role="status" className="mt-1 text-meta text-ink-secondary">
                  {deviceDisconnectedLine}
                </p>
              )}
              <button
                type="button"
                onClick={() => void onConnectDevice()}
                disabled={deviceConnecting}
                className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
              >
                {deviceConnecting
                  ? t('確認中…')
                  : deviceDenied
                    ? t('もう一度許可する')
                    : t('端末カレンダーを接続')}
              </button>
            </>
          )}

          {(deviceActionErrorKey ?? deviceLoadErrorKey) && (
            <p role="alert" className="mt-2 text-meta text-danger">
              {resolveMessage(deviceActionErrorKey ?? deviceLoadErrorKey!)}
            </p>
          )}
        </div>
      )}

      <DisconnectSheet
        open={disconnectOpen}
        title={t('Google 接続を解除')}
        impact={impact}
        busy={disconnecting}
        errorKey={disconnectErrorKey}
        onConfirm={() => void confirmDisconnect()}
        onClose={() => setDisconnectOpen(false)}
      />

      <DisconnectSheet
        open={deviceDisconnectOpen}
        title={t('端末カレンダー接続を解除')}
        impact={deviceImpact}
        busy={deviceDisconnecting}
        errorKey={deviceDisconnectErrorKey}
        onConfirm={() => void confirmDeviceDisconnect()}
        onClose={() => setDeviceDisconnectOpen(false)}
      />
    </section>
  );
}
