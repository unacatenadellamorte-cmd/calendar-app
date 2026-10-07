import { useCallback, useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '@/i18n';
import { env } from '@/data/env';
import { startGoogleConnect } from '@/data/connections';
import { resolveMessage } from '@/data/messages';
import { useGoogleConnections } from '@/features/connections/model/useGoogleConnections';
import { GoogleAccountCalendars } from '@/features/connections/ui/GoogleCalendarPicker';
import { Screen } from '@/ui/Screen';

/** アプリの認証とは別の、任意のGoogle読取接続。購入や書込認可は開始しない。 */
export function GoogleSetupScreen({ onContinue }: { onContinue: () => void }) {
  useLanguage();
  const available = env.hasSupabase && env.hasGoogleOauth;
  const { connections, loading, errorKey, refresh } = useGoogleConnections(available);
  const active = connections.filter((connection) => connection.status === 'active');
  const [connecting, setConnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingConnections, setSavingConnections] = useState<ReadonlySet<string>>(new Set());
  const selectionPending = active.some((connection) => savingConnections.has(connection.id));
  const reportSelectionPending = useCallback((id: string, pending: boolean) => {
    setSavingConnections((previous) => {
      if (previous.has(id) === pending) return previous;
      const next = new Set(previous);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const connect = async () => {
    if (busy.current) return;
    busy.current = true;
    setConnecting(true);
    setActionError(null);
    try {
      const result = await startGoogleConnect();
      if (!mounted.current) return;
      if (result?.ok) refresh();
      else if (result) setActionError(result.error.messageKey);
    } catch {
      if (mounted.current) setActionError('connection/exchange-failed');
    } finally {
      busy.current = false;
      if (mounted.current) setConnecting(false);
    }
  };

  return (
    <Screen title={t('Googleアカウントを接続（任意）')}>
      <p className="mb-4 text-body text-ink-primary">
        {t('アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。')}
      </p>
      <p className="mb-4 text-meta text-ink-secondary">
        {t('接続はスキップできます。後から「設定」で追加できます。')}
      </p>
      {!available ? (
        <p className="text-meta text-ink-secondary">
          {t('Google接続は現在利用できません。後から設定できます。')}
        </p>
      ) : loading ? (
        <p role="status" className="text-meta text-ink-secondary">
          {t('読み込み中…')}
        </p>
      ) : errorKey ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
          <button type="button" onClick={refresh} className="min-h-11 text-meta text-accent">
            {t('もう一度試す')}
          </button>
        </div>
      ) : active.length > 0 ? (
        <>
          <p role="status" className="text-body text-ink-primary">
            {t('接続しました')}
          </p>
          <p className="mt-3 text-meta text-ink-secondary">
            {t('取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。')}
          </p>
          {active.map((connection) => (
            <GoogleAccountCalendars
              key={connection.id}
              connectionId={connection.id}
              email={connection.googleEmail ?? t('Google アカウント')}
              onSelectionPendingChange={reportSelectionPending}
            />
          ))}
          <button
            type="button"
            onClick={onContinue}
            disabled={selectionPending}
            className="mt-6 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
          >
            {t('ユーザー名の設定へ')}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={connecting}
          onClick={() => void connect()}
          className="min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
        >
          {connecting ? t('接続を確認しています…') : t('Google を接続')}
        </button>
      )}
      {actionError && (
        <p role="alert" className="mt-3 text-meta text-danger">
          {resolveMessage(actionError)}
        </p>
      )}
      <button
        type="button"
        disabled={selectionPending}
        onClick={onContinue}
        className="mt-4 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
      >
        {t('スキップしてユーザー名を設定')}
      </button>
    </Screen>
  );
}
