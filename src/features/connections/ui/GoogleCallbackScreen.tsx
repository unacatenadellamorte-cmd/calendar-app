import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { resolveMessage } from '@/data/messages';
import { completeGoogleConnect } from '@/data/connections';
type Phase =
  | {
      kind: 'working';
    }
  | {
      kind: 'done';
      email: string | null;
    }
  | {
      kind: 'error';
      messageKey: string;
    };
/**
 * `/connections/google/callback`(Story 3.1)。
 * Google から戻ってきた認可コードを oauth-exchange に渡す。
 * 成功したら設定へ戻る。失敗はメッセージと戻る導線を出す。
 */
export function GoogleCallbackScreen() {
  useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'working' });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let timer: number | undefined;
    void completeGoogleConnect(params).then((result) => {
      if (result.ok) {
        setPhase({ kind: 'done', email: result.value.googleEmail });
        // 少し見せてから設定へ。
        timer = window.setTimeout(() => navigate('/settings', { replace: true }), 900);
      } else {
        setPhase({ kind: 'error', messageKey: result.error.messageKey });
      }
    });
    return () => window.clearTimeout(timer);
  }, [params, navigate]);
  return (
    <Screen title={t('Google を接続')}>
      <div className="mt-4 rounded-md border border-border-hairline bg-surface-raised p-4">
        {phase.kind === 'working' && (
          <p className="text-body text-ink-secondary" role="status">
            {t('接続を確認しています…')}
          </p>
        )}

        {phase.kind === 'done' && (
          <>
            <p className="text-body text-ink-primary" role="status">
              {t('接続しました')}
            </p>
            {phase.email && <p className="mt-1 text-meta text-ink-secondary">{phase.email}</p>}
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <p role="alert" className="text-body text-danger">
              {resolveMessage(phase.messageKey)}
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings', { replace: true })}
              className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
            >
              {t('設定へ戻る')}
            </button>
          </>
        )}
      </div>
    </Screen>
  );
}
