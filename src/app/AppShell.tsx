import { Link, Outlet } from 'react-router-dom';
import { BottomTabs } from './BottomTabs';
import { OnlineProvider } from './OnlineProvider';
import { ConnectivityBar } from './ConnectivityBar';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { useAuth } from './auth-context';
import { resolveMessage } from '@/data/messages';
import { useProfile } from '@/features/profile/model/useProfile';
import { AvatarIcon } from '@/features/profile/ui/AvatarIcon';
import { OnboardingScreen } from '@/features/profile/ui/OnboardingScreen';
import type { ProfileOutletContext } from './profile-outlet-context';

/**
 * アプリシェル。単一カラム。接続状態バーを最上部に、現在ルートの画面を Outlet に、
 * 下タブバーを常時表示。SW 更新プロンプトは最前面に浮かせる。
 *
 * `useProfile()` は「ここだけ」で呼ぶ(レビュー指摘: 画面ごとに別インスタンスを
 * 持つと、オンボーディング送信後も AppShell 側の profile が null のままになり
 * ユーザーが永久にオンボーディングへ閉じ込められる)。`OnboardingScreen` へは props、
 * `<Outlet/>` 配下(`ProfileScreen` 等)へは `<Outlet context>` で状態を配る。
 *
 * 描画の優先順位:
 *  1. 認証未確定(`state==='loading'`)、または profiles 取得中 → 待機表示のみ
 *  2. profiles 取得(reload)自体が失敗 → エラー表示 + 再試行(オンボーディングには倒さない。
 *     既存ユーザーが通信エラーに遭遇するたびオンボーディングへ閉じ込められるのを防ぐ)
 *  3. guest/authenticated が確定 かつ profiles 行が無い → オンボーディング(下タブ含め他は見せない)
 *  4. それ以外 → 従来どおり Outlet + 下タブ。profiles 行があれば最上部にアバター(→ /profile)
 */
export function AppShell() {
  const { state } = useAuth();
  const authResolving = state === 'loading';
  const enabled = state === 'guest' || state === 'authenticated';
  const { profile, loading, errorKey, loadErrorKey, reload, create, update } = useProfile(enabled);

  const showWaiting = authResolving || (enabled && loading);
  const showProfileError = !showWaiting && enabled && Boolean(loadErrorKey);
  const needsOnboarding = !showWaiting && !showProfileError && enabled && profile === null;

  const outletContext: ProfileOutletContext = { profile, loading, errorKey, update, reload };

  return (
    <OnlineProvider>
      <div className="mx-auto min-h-[100dvh] w-full max-w-2xl bg-surface-sunken">
        <ConnectivityBar />
        {showWaiting ? (
          <p className="px-4 py-8 text-center text-meta text-ink-secondary">読み込み中…</p>
        ) : showProfileError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p role="alert" className="text-meta text-danger">
              {resolveMessage(loadErrorKey!)}
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="min-h-11 rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
            >
              もう一度試す
            </button>
          </div>
        ) : needsOnboarding ? (
          <OnboardingScreen create={create} errorKey={errorKey} />
        ) : (
          <>
            {profile && (
              <div className="flex justify-end px-4 pt-3">
                <Link
                  to="/profile"
                  aria-label="プロフィール"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
                >
                  <AvatarIcon displayName={profile.displayName} avatarDataUrl={profile.avatarDataUrl} />
                </Link>
              </div>
            )}
            <Outlet context={outletContext} />
            <BottomTabs />
          </>
        )}
        <PwaUpdatePrompt />
      </div>
    </OnlineProvider>
  );
}
