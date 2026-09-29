import { useEffect } from 'react';
import { onAppResume } from '@/platform/appLifecycle';
import { refreshFeaturedWidget } from '@/platform/widget';
import { useAuth } from './auth-context';
import { useLanguage } from '@/i18n';
import { WIDGET_APPEARANCE_CHANGED } from '@/platform/widgetAppearanceEvents';
import { readStoredTheme } from '@/features/settings/model/useTheme';

/**
 * フォアグラウンド復帰のたびにホーム画面ウィジェットを最新化する、非表示コンポーネント
 * (Story 5.6)。`DeviceSyncOnResume.tsx` と同型 ── UI は持たず常に `null` を返す。
 * `src/main.tsx` で `<DeviceSyncOnResume />` と並べて配置する。
 *
 * `refreshFeaturedWidget` 自体が Web(非ネイティブ)での早期リターンと失敗時の
 * 警告ログのみ(投げない)を担うため、ここでは呼ぶだけでよい。
 */
export function WidgetSync() {
  const { state, session } = useAuth();
  const language = useLanguage();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (state !== 'guest' && state !== 'authenticated') return;
    void refreshFeaturedWidget();
  }, [state, userId, language]);

  useEffect(() => {
    if (state !== 'guest' && state !== 'authenticated') return;
    return onAppResume(() => void refreshFeaturedWidget());
  }, [state]);
  useEffect(() => {
    if ((state !== 'guest' && state !== 'authenticated') || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const refreshForSystemTheme = () => {
      if (readStoredTheme() === 'system') void refreshFeaturedWidget();
    };
    media.addEventListener?.('change', refreshForSystemTheme);
    return () => media.removeEventListener?.('change', refreshForSystemTheme);
  }, [state]);
  useEffect(() => {
    if (state !== 'guest' && state !== 'authenticated') return;
    const refresh = () => void refreshFeaturedWidget();
    window.addEventListener(WIDGET_APPEARANCE_CHANGED, refresh);
    return () => window.removeEventListener(WIDGET_APPEARANCE_CHANGED, refresh);
  }, [state]);
  return null;
}
