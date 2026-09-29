import { t, useLanguage } from '@/i18n';
import { useState } from 'react';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import { buildExportBundle } from '@/data/export';
import { downloadJson } from '@/lib/download';
import { todayLocalDate } from '@/lib/datetime';
/**
 * 設定画面の「データ」欄。ローカルで作成したカレンダー・予定を JSON で書き出す(FR17)。
 */
export function DataSection() {
  useLanguage();
  const { state } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const onExport = async () => {
    setBusy(true);
    setErrorKey(null);
    const result = await buildExportBundle();
    setBusy(false);
    if (!result.ok) {
      setErrorKey(result.error.messageKey);
      return;
    }
    try {
      downloadJson(`calendar-app-export-${todayLocalDate()}.json`, result.value);
    } catch {
      setErrorKey('export/failed');
    }
  };
  return (
    <section aria-labelledby="data-heading" className="mt-6">
      <h2 id="data-heading" className="text-body font-semibold text-ink-primary">
        {t('データ')}
      </h2>
      <div className="mt-3 rounded-md border border-border-hairline bg-surface-raised p-4">
        {state === 'unavailable' ? (
          <p className="text-meta text-ink-secondary">
            {t('Supabase を設定すると、データをエクスポートできます。')}
          </p>
        ) : (
          <>
            <p className="text-meta text-ink-secondary">
              {t(
                'ローカルで作成したカレンダーと予定を JSON で書き出します。取り込んだ予定は含みません。',
              )}
            </p>
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={busy}
              className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
            >
              {busy ? t('書き出し中…') : t('JSON でエクスポート')}
            </button>
            {errorKey && (
              <p role="alert" className="mt-2 text-meta text-danger">
                {resolveMessage(errorKey)}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
