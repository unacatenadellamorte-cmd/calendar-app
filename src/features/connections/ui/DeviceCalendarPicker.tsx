import { t, useLanguage } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { env } from '@/data/env';
import { resolveMessage } from '@/data/messages';
import { useDeviceConnection } from '@/features/connections/model/useDeviceConnection';
import { useDeviceCalendars } from '@/features/connections/model/useDeviceCalendars';
import { DEFAULT_NAME, DEFAULT_COLOR } from '@/data/device-calendars';
/**
 * `/connections/device/calendars`(Story 5.2)。`GoogleCalendarPicker` と同型の
 * 一覧画面。接続した端末カレンダーの候補を出し、取り込む対象を選ぶ。
 * オンにすると source='device' のカレンダーとして一覧・表示に加わる
 * (予定の同期は Story 5.3。取り込み時刻・失敗の表示はここには無い)。
 */
export function DeviceCalendarPicker() {
  useLanguage();
  const navigate = useNavigate();
  const { state } = useAuth();
  const connectionEnabled = env.hasSupabase && state === 'authenticated';
  const { connection, loading: connLoading } = useDeviceConnection(connectionEnabled);
  const enabled = connectionEnabled && !!connection;
  const { choices, loading, refreshing, errorKey, refresh, toggle } = useDeviceCalendars(
    enabled && connection ? connection.id : null,
  );
  if (connLoading) {
    return (
      <Screen title={t('取り込むカレンダー')}>
        <p className="mt-4 text-meta text-ink-secondary">{t('読み込み中…')}</p>
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen title={t('取り込むカレンダー')}>
        <div className="mt-4 rounded-md border border-border-hairline bg-surface-raised p-4">
          <p className="text-body text-ink-primary">
            {t('先に端末カレンダーを接続してください')}
          </p>
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
  const selectedCount = choices.filter((c) => c.selected).length;
  return (
    <Screen
      title={t('取り込むカレンダー')}
      action={
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="min-h-11 text-meta text-accent disabled:opacity-60"
        >
          {refreshing ? t('更新中…') : t('更新')}
        </button>
      }
    >
      <p className="mt-1 text-meta text-ink-secondary">
        {t('オンにしたカレンダーの予定を読み取り専用で取り込みます。{0} 件選択中。', [
          selectedCount,
        ])}
      </p>

      {errorKey && (
        <p role="alert" className="mt-3 text-meta text-danger">
          {resolveMessage(errorKey)}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-meta text-ink-secondary">{t('読み込み中…')}</p>
      ) : choices.length === 0 ? (
        <p className="mt-4 text-meta text-ink-secondary">
          {t('取り込めるカレンダーが見つかりませんでした。')}
        </p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised">
          {choices.map((c, i) => (
            <li
              key={c.externalCalendarId}
              className={i > 0 ? 'border-t border-border-hairline' : ''}
            >
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.backgroundColor ?? DEFAULT_COLOR }}
                />
                <span className="flex-1 text-body text-ink-primary">
                  {c.summary || DEFAULT_NAME}
                </span>
                <input
                  type="checkbox"
                  className="size-5"
                  checked={c.selected}
                  onChange={(e) => void toggle(c.externalCalendarId, e.target.checked)}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
