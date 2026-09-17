import { t, useLanguage } from '@/i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import { createShifts } from '@/data/shifts';
import type { ShiftTemplate } from '@/data/shift-templates';
import { addDays } from '@/lib/calendar-view';
import { todayLocalDate } from '@/lib/datetime';
import { refreshFeaturedWidget } from '@/platform/widget';
import { useCalendars } from '@/features/calendars/model/useCalendars';
import { useShiftTemplates } from '@/features/shifts/model/useShiftTemplates';
import { ShiftTemplateChip } from './ShiftTemplateChip';
const MAX_DAYS = 14;
/** `<input type="date">` の値の形だけを通す(空/不正値からの1900年シフト作成を防ぐ)。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * シフト入力の専用ページ(月表示タップ再設計とシフト入力ページ分離)。
 * 旧 `QuickShiftSheet`(廃止)のロジック(日数ステッパ・テンプレチップ横スクロール・空状態)を
 * そのまま移植し、`BottomSheet` ラップだけを `Screen` ページへ置き換えた。
 * タップ由来の prefill が無いため、起点日は `<input type="date">` で選ぶ(既定値=今日)。
 * 成功時は `/calendar` へ戻る(作成結果が見える状態にする)。
 */
export function QuickShiftScreen() {
  useLanguage();
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const cal = useCalendars(enabled);
  const sh = useShiftTemplates(enabled);
  const navigate = useNavigate();
  const [date, setDate] = useState(() => todayLocalDate());
  const [dayCount, setDayCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const shiftCalendar = cal.calendars.find((c) => c.isShift);
  const shiftReady = Boolean(shiftCalendar);
  const dateValid = DATE_RE.test(date);
  // テンプレ選択を許可する条件。カレンダー未取得 or 起点日が空/不正ならタップを無効化する。
  const canPick = shiftReady && dateValid;
  if (state === 'unavailable') {
    return (
      <Screen title={t('シフトを追加')}>
        <p className="text-body text-ink-secondary">
          {t('Supabase を設定すると、シフトを追加できます。')}
        </p>
      </Screen>
    );
  }
  const pick = async (template: ShiftTemplate) => {
    if (busy || !canPick || !shiftCalendar) return;
    setBusy(true);
    const dates = Array.from({ length: dayCount }, (_, i) => addDays(date, i));
    const result = await createShifts(shiftCalendar.id, template, dates);
    setBusy(false);
    if (!result.ok) {
      setErrorKey(result.error.messageKey);
      return;
    }
    // 代表予定が変わり得るのでウィジェットも最新化する(useEvents の create/addLocal と同じ契約、Story 5.6)。
    void refreshFeaturedWidget();
    navigate('/calendar');
  };
  return (
    <Screen title={t('シフトを追加')}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-meta text-ink-secondary">{t('起点日')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setErrorKey(null);
            }}
            className="min-h-11 w-full rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          />
        </label>

        {errorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}

        {cal.loading || sh.loading ? (
          <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
        ) : sh.templates.length === 0 ? (
          <>
            <p className="text-body text-ink-secondary">
              {t('よく使うシフトを登録すると1タップで入れられます。')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/shift-templates')}
              className="min-h-11 rounded-sm border border-dashed border-accent px-4 text-body text-accent"
            >
              {t('＋ お気に入りシフトを作る')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-meta text-ink-secondary">{t('この日から')}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t('日数を減らす')}
                  disabled={dayCount <= 1}
                  onClick={() => setDayCount((n) => Math.max(1, n - 1))}
                  className="h-11 w-11 rounded-sm border border-border-hairline text-body disabled:opacity-40"
                >
                  −
                </button>
                <span className="tabular w-10 text-center text-body" aria-live="polite">
                  {t('{0} 日', [dayCount])}
                </span>
                <button
                  type="button"
                  aria-label={t('日数を増やす')}
                  disabled={dayCount >= MAX_DAYS}
                  onClick={() => setDayCount((n) => Math.min(MAX_DAYS, n + 1))}
                  className="h-11 w-11 rounded-sm border border-border-hairline text-body disabled:opacity-40"
                >
                  ＋
                </button>
              </div>
            </div>

            <div
              className={[
                'flex gap-2 overflow-x-auto pb-1',
                canPick ? '' : 'pointer-events-none opacity-50',
              ].join(' ')}
              aria-disabled={!canPick}
            >
              {sh.templates.map((t) => (
                <span key={t.id} className="flex-none">
                  <ShiftTemplateChip template={t} onTap={() => void pick(t)} />
                </span>
              ))}
            </div>
            {!shiftReady && (
              <p className="text-meta text-ink-secondary">
                {t('シフト用カレンダーを準備しています。少し待って再度お試しください。')}
              </p>
            )}
            {shiftReady && !dateValid && (
              <p className="text-meta text-ink-secondary">{t('起点日を入力してください。')}</p>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}
