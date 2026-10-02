import { t, useLanguage } from '@/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  type GoogleConnectionInfo,
} from '@/data/connections';
import { listSyncState } from '@/data/google-sync';
import { connectDevice, disconnectDevice } from '@/data/device-connections';
import { isDeviceCalendarSupported } from '@/platform/deviceCalendar';
import { formatEventTime } from '@/lib/datetime';
import { useGoogleConnections } from '@/features/connections/model/useGoogleConnections';
import { useGoogleSync } from '@/features/connections/model/useGoogleSync';
import { useDeviceConnection } from '@/features/connections/model/useDeviceConnection';
import { useDeviceSync } from '@/features/connections/model/useDeviceSync';
import { useEntitlements } from '@/features/billing/model/useEntitlements';
import { hasSeenPlanSheet, markPlanSheetSeen } from '@/features/billing/model/planSheetSeen';
import { PlanSheet } from '@/features/billing/ui/PlanSheet';
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
 *  - authenticated:  接続中ならアカウントごとに email + 取り込むカレンダー導線 +「解除」、
 *                    全体の「今すぐ取り込み」+「Google アカウントを追加」。未接続なら「Google を接続」
 * 複数 Google アカウント(CAP-3): suspended(課金失効で停止中)の接続は「停止中」と出し、
 * 取り込み・カレンダー選択の導線は出さない(解除はできる)。
 * プラン案内(CAP-5): 初回の「Google を接続」と、権利なしでの「Google アカウントを追加」で
 * PlanSheet を出す。無料の1アカウント接続は初回シートからいつでも選べる。
 * 端末カレンダーブロックも同じパターン(取り込み・解除は Story 5.3)。
 */
export function ConnectionsSection() {
  useLanguage();
  const { state, session } = useAuth();
  const authIdentity = `${state}:${session?.user.id ?? ''}`;
  const currentAuth = useRef<string | null>(authIdentity);
  currentAuth.current = authIdentity;
  useEffect(() => {
    currentAuth.current = authIdentity;
    return () => { currentAuth.current = null; };
  }, [authIdentity]);
  const connectBusy = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const navigate = useNavigate();
  const { refetch } = useOnline();
  // 複数 Google 接続対応: 接続一覧を取得
  const { connections, loading, errorKey, refresh } = useGoogleConnections(
    env.hasSupabase && env.hasGoogleOauth,
  );
  const activeConnections = connections.filter((c) => c.status === 'active');
  const { hasMultiAccount } = useEntitlements();
  // プラン案内シート(CAP-5)。null = 閉じている。
  const [planSheet, setPlanSheet] = useState<'first-connect' | 'add-account' | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
  // 接続解除の確認シート(Story 3.4)。複数接続対応で connectionId を保持。
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<GoogleConnectionInfo | null>(null);
  const [impact, setImpact] = useState<DisconnectImpact | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectErrorKey, setDisconnectErrorKey] = useState<string | null>(null);
  const [disconnectedLine, setDisconnectedLine] = useState<string | null>(null);
  const openDisconnect = (conn: GoogleConnectionInfo) => {
    setSelectedConnection(conn);
    setImpact(null);
    setDisconnectErrorKey(null);
    setDisconnectOpen(true);
    void getDisconnectImpact(conn.id).then((r) => {
      if (r.ok) setImpact(r.value);
    });
  };
  const confirmDisconnect = async () => {
    if (!selectedConnection) return;
    setDisconnecting(true);
    setDisconnectErrorKey(null);
    const result = await disconnectGoogle(selectedConnection.id);
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
  const onConnect = async () => {
    if (connectBusy.current) return;
    connectBusy.current = true;
    setConnecting(true);
    setActionErrorKey(null);
    const startedAuth = authIdentity;
    try {
      const result = await startGoogleConnect();
      if (currentAuth.current !== startedAuth) return;
      if (result && !result.ok) setActionErrorKey(result.error.messageKey);
      if (result?.ok) {
        refresh();
        refetch();
        navigate('/connections/google/calendars');
      }
    } finally {
      connectBusy.current = false;
      if (currentAuth.current !== null) setConnecting(false);
    }
  };
  // 接続0件の「Google を接続」: 初回だけプラン案内を出す(無料で1つ接続するも選べる)。
  const onFirstConnectClick = () => {
    if (connectBusy.current) return;
    if (hasSeenPlanSheet()) void onConnect();
    else setPlanSheet('first-connect');
  };
  // 接続1件以上の「Google アカウントを追加」: 複数アカウントの権利があれば直接認可へ。
  // 権利が無ければプラン案内(無料で続けるボタンは無い)。最終的な上限はサーバーが強制し、
  // 超過は connection/limit-reached として表示される(権利の取得遅延などの保険)。
  const onAddAccountClick = () => {
    if (connectBusy.current) return;
    if (hasMultiAccount) void onConnect();
    else setPlanSheet('add-account');
  };
  const closePlanSheet = () => {
    if (planSheet === 'first-connect') markPlanSheetSeen();
    setPlanSheet(null);
  };
  const continueFree = () => {
    markPlanSheetSeen();
    setPlanSheet(null);
    void onConnect();
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
  // 取り込み状態は全接続の最後の時刻を追跡する。複数接続対応で connection → connections に。
  useEffect(() => {
    if (connections.length > 0) void reloadSyncState();
  }, [connections.length, reloadSyncState]);

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
        ) : connections.length > 0 ? (
          <>
            <p className="text-meta text-ink-secondary">{t('Google に接続中')}</p>
            {/* 複数接続対応: 接続済みアカウントごとの行 */}
            <ul className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised">
              {connections.map((conn, i) => {
                const label = conn.googleEmail ?? t('Google アカウント');
                return (
                  <li
                    key={conn.id}
                    className={['px-4 py-3', i > 0 ? 'border-t border-border-hairline' : ''].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-ink-primary">{label}</p>
                        {conn.status === 'suspended' && (
                          <p className="mt-1 text-meta text-ink-secondary">
                            {t('停止中: 取り込みを止めています。有料プランの再契約で再開します。')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openDisconnect(conn)}
                        aria-label={t('{0} の接続を解除', [label])}
                        className="min-h-11 shrink-0 px-2 text-meta text-danger"
                      >
                        {t('解除')}
                      </button>
                    </div>
                    {conn.status === 'active' && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/connections/google/calendars?connection=${encodeURIComponent(conn.id)}`,
                          )
                        }
                        aria-label={t('{0} の取り込むカレンダーを選ぶ', [label])}
                        className="mt-2 flex min-h-11 w-full items-center justify-between rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
                      >
                        {t('取り込むカレンダーを選ぶ')}
                        <span aria-hidden="true" className="text-ink-secondary">
                          ›
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {activeConnections.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={startGoogleSync}
                  disabled={syncing}
                  aria-label={t('Google の今すぐ取り込み')}
                  className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
                >
                  {syncing ? t('同期中') : t('今すぐ取り込み')}
                </button>

                <p className="mt-2 text-meta text-ink-secondary">
                  {lastSyncedAt
                    ? t('最終取り込み: {0}', [formatEventTime(lastSyncedAt)])
                    : t('まだ取り込んでいません')}
                </p>
              </>
            )}

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

            {disconnectedLine && (
              <p role="status" className="mt-1 text-meta text-ink-secondary">
                {disconnectedLine}
              </p>
            )}

            <button
              type="button"
              onClick={onAddAccountClick}
              disabled={connecting}
              className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-accent disabled:opacity-60"
            >
              {connecting ? t('確認中…') : t('Google アカウントを追加')}
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
              onClick={onFirstConnectClick}
              disabled={connecting}
              className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
            >
              {connecting ? t('確認中…') : t('Google を接続')}
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
        title={
          selectedConnection
            ? t('{0} の接続を解除', [selectedConnection.googleEmail ?? t('Google アカウント')])
            : t('Google 接続を解除')
        }
        impact={impact}
        busy={disconnecting}
        errorKey={disconnectErrorKey}
        onConfirm={() => void confirmDisconnect()}
        onClose={() => {
          setDisconnectOpen(false);
          setSelectedConnection(null);
        }}
      />

      <PlanSheet
        open={planSheet !== null}
        reason={planSheet ?? 'first-connect'}
        onClose={closePlanSheet}
        onContinueFree={planSheet === 'first-connect' ? continueFree : undefined}
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
