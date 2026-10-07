import { useEffect } from 'react';
import { t, useLanguage } from '@/i18n';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { env } from '@/data/env';
import { resolveMessage } from '@/data/messages';
import { formatEventTime } from '@/lib/datetime';
import { useGoogleConnections } from '@/features/connections/model/useGoogleConnections';
import { useGoogleCalendars } from '@/features/connections/model/useGoogleCalendars';

/**
 * `/connections/google/calendars`(Story 3.2 / CAP-3)。
 * 接続した Google アカウントごとにカレンダー候補を出し、取り込む対象を選ぶ。
 * オンにすると source='google' のカレンダーとして一覧・表示に加わる(予定同期は 3.3)。
 *
 * 複数アカウント: active の接続ごとに {@link GoogleAccountCalendars} を1つ出す。
 * suspended(課金失効で停止中)の接続は取り込みもカレンダー選択もしないので出さない。
 * `?connection=<id>` があればそのアカウントだけを出す(設定画面の各行から来る導線)。
 */
export function GoogleCalendarPicker() {
  useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { state } = useAuth();
  const connectionEnabled = env.hasSupabase && env.hasGoogleOauth && state === 'authenticated';
  const { connections, loading: connLoading } = useGoogleConnections(connectionEnabled);
  const active = connections.filter((c) => c.status === 'active');
  const requested = params.get('connection');
  const focused = requested ? active.filter((c) => c.id === requested) : [];
  // 指定された接続が見つからない(解除済み・停止中など)ときは全アカウントを出す。
  const shown = focused.length > 0 ? focused : active;
  if (connLoading) {
    return (
      <Screen title={t('取り込むカレンダー')}>
        <p className="mt-4 text-meta text-ink-secondary">{t('読み込み中…')}</p>
      </Screen>
    );
  }
  if (!connectionEnabled || shown.length === 0) {
    return (
      <Screen title={t('取り込むカレンダー')}>
        <div className="mt-4 rounded-md border border-border-hairline bg-surface-raised p-4">
          <p className="text-body text-ink-primary">{t('先に Google を接続してください')}</p>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
          >
            {t('設定へ')}
          </button>
        </div>
      </Screen>
    );
  }
  return (
    <Screen title={t('取り込むカレンダー')}>
      <p className="mt-1 text-meta text-ink-secondary">
        {t('オンにしたカレンダーの予定を読み取り専用で取り込みます。')}
      </p>
      {shown.map((c) => (
        <GoogleAccountCalendars
          key={c.id}
          connectionId={c.id}
          email={c.googleEmail ?? t('Google アカウント')}
        />
      ))}
    </Screen>
  );
}

interface GoogleAccountCalendarsProps {
  /** 対象の接続 ID。google-calendars 関数へそのまま渡す。 */
  connectionId: string;
  /** 見出しに出すアカウント名(メール)。 */
  email: string;
  /** 初回設定の親へ、選択保存中だけ次段階を待たせるための通知。 */
  onSelectionPendingChange?: (connectionId: string, pending: boolean) => void;
}

/** 1つの Google アカウント分のカレンダー候補(見出し・更新・オン/オフ)。 */
export function GoogleAccountCalendars({
  connectionId,
  email,
  onSelectionPendingChange,
}: GoogleAccountCalendarsProps) {
  useLanguage();
  const { choices, loading, refreshing, pendingSelections, errorKey, refresh, toggle } =
    useGoogleCalendars(connectionId);
  const saving = pendingSelections > 0;
  useEffect(() => {
    onSelectionPendingChange?.(connectionId, saving);
  }, [connectionId, saving, onSelectionPendingChange]);
  const selectedCount = choices.filter((c) => c.selected).length;
  const headingId = `google-account-${connectionId}`;
  return (
    <section aria-labelledby={headingId} className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <h2
          id={headingId}
          className="min-w-0 truncate text-body font-semibold text-ink-primary"
        >
          {email}
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label={t('{0} のカレンダーを更新', [email])}
          className="min-h-11 shrink-0 text-meta text-accent disabled:opacity-60"
        >
          {refreshing ? t('同期中') : t('更新')}
        </button>
      </div>
      <p className="text-meta text-ink-secondary">{t('{0} 件選択中。', [selectedCount])}</p>
      {saving && (
        <p role="status" className="text-meta text-ink-secondary">
          {t('保存中…')}
        </p>
      )}

      {errorKey && (
        <p role="alert" className="mt-2 text-meta text-danger">
          {resolveMessage(errorKey)}
        </p>
      )}

      {loading ? (
        <p className="mt-3 text-meta text-ink-secondary">{t('読み込み中…')}</p>
      ) : choices.length === 0 ? (
        <p className="mt-3 text-meta text-ink-secondary">
          {t('取り込めるカレンダーが見つかりませんでした。')}
        </p>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-md border border-border-hairline bg-surface-raised">
          {choices.map((c, i) => (
            <li
              key={c.externalCalendarId}
              className={i > 0 ? 'border-t border-border-hairline' : ''}
            >
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 pt-2">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.backgroundColor ?? '#7A7A7A' }}
                />
                <span className="flex-1 text-body text-ink-primary">
                  {c.summary || t('Google カレンダー')}
                </span>
                <input
                  type="checkbox"
                  className="size-5"
                  checked={c.selected}
                  onChange={(e) => void toggle(c.externalCalendarId, e.target.checked)}
                />
              </label>
              {c.selected && (
                <p className="px-4 pb-2 pl-10 text-meta text-ink-secondary">
                  {c.lastError
                    ? t('前回は取り込めませんでした')
                    : c.lastSyncedAt
                      ? t('最終取り込み: {0}', [formatEventTime(c.lastSyncedAt)])
                      : t('まだ取り込んでいません')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
