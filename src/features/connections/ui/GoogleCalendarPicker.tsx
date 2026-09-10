import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { env } from '@/data/env';
import { resolveMessage } from '@/data/messages';
import { useGoogleConnection } from '@/features/connections/model/useGoogleConnection';
import { useGoogleCalendars } from '@/features/connections/model/useGoogleCalendars';

/**
 * `/connections/google/calendars`(Story 3.2)。
 * 接続した Google アカウントのカレンダー候補を出し、取り込む対象を選ぶ。
 * オンにすると source='google' のカレンダーとして一覧・表示に加わる(予定同期は 3.3)。
 */
export function GoogleCalendarPicker() {
  const navigate = useNavigate();
  const { state } = useAuth();
  const connectionEnabled = env.hasSupabase && env.hasGoogleOauth && state === 'authenticated';
  const { connection, loading: connLoading } = useGoogleConnection(connectionEnabled);
  const enabled = connectionEnabled && !!connection;
  const { choices, loading, refreshing, errorKey, refresh, toggle } = useGoogleCalendars(enabled);

  if (connLoading) {
    return (
      <Screen title="取り込むカレンダー">
        <p className="mt-4 text-meta text-ink-secondary">読み込み中…</p>
      </Screen>
    );
  }

  if (!enabled) {
    return (
      <Screen title="取り込むカレンダー">
        <div className="mt-4 rounded-md border border-border-hairline bg-surface-raised p-4">
          <p className="text-body text-ink-primary">先に Google を接続してください</p>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
          >
            設定へ
          </button>
        </div>
      </Screen>
    );
  }

  const selectedCount = choices.filter((c) => c.selected).length;

  return (
    <Screen
      title="取り込むカレンダー"
      action={
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="min-h-11 text-meta text-accent disabled:opacity-60"
        >
          {refreshing ? '更新中…' : '更新'}
        </button>
      }
    >
      <p className="mt-1 text-meta text-ink-secondary">
        オンにしたカレンダーの予定を読み取り専用で取り込みます。{selectedCount} 件選択中。
      </p>

      {errorKey && (
        <p role="alert" className="mt-3 text-meta text-danger">
          {resolveMessage(errorKey)}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-meta text-ink-secondary">読み込み中…</p>
      ) : choices.length === 0 ? (
        <p className="mt-4 text-meta text-ink-secondary">
          取り込めるカレンダーが見つかりませんでした。
        </p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised">
          {choices.map((c, i) => (
            <li
              key={c.externalCalendarId}
              className={i > 0 ? 'border-t border-border-hairline' : ''}
            >
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.backgroundColor ?? '#7A7A7A' }}
                />
                <span className="flex-1 text-body text-ink-primary">
                  {c.summary || 'Google カレンダー'}
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
