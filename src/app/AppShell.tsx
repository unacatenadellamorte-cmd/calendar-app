import { t, useLanguage } from '@/i18n';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { BottomTabs } from './BottomTabs';
import { OnlineProvider } from './OnlineProvider';
import { SecretModeProvider } from './SecretModeProvider';
import { useSecretMode } from './secret-mode-context';
import { SecretModeQuickUnlockSheet } from './SecretModeQuickUnlockSheet';
import { ConnectivityBar } from './ConnectivityBar';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { useAuth } from './auth-context';
import { resolveMessage } from '@/data/messages';
import { useProfile } from '@/features/profile/model/useProfile';
import { AvatarIcon } from '@/features/profile/ui/AvatarIcon';
import { OnboardingScreen } from '@/features/profile/ui/OnboardingScreen';
import type { Profile } from '@/data/profiles';
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
 *  4. それ以外 → 従来どおり Outlet + 下タブ。profiles 行があれば最上部にアバター
 *     (シングルタップ→ /profile、ダブルタップ→シークレットモードON/OFF、`AvatarNav`)
 */
export function AppShell() {
  useLanguage();
  const { state } = useAuth();
  const authResolving = state === 'loading';
  const enabled = state === 'guest' || state === 'authenticated';
  const { profile, loading, errorKey, loadErrorKey, reload, create, update } =
    useProfile(enabled);
  const showWaiting = authResolving || (enabled && loading);
  const showProfileError = !showWaiting && enabled && Boolean(loadErrorKey);
  const needsOnboarding = !showWaiting && !showProfileError && enabled && profile === null;
  const outletContext: ProfileOutletContext = { profile, loading, errorKey, update, reload };
  return (
    <OnlineProvider>
      <SecretModeProvider
        passcodeHash={profile?.secretPasscodeHash ?? null}
        onChangePasscodeHash={(hash) => update({ secretPasscodeHash: hash })}
      >
        <div
          className="app-shell mx-auto min-h-[100dvh] w-full max-w-2xl bg-surface-sunken"
          style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' }}
        >
          <ConnectivityBar />
          {showWaiting ? (
            <p className="px-4 py-8 text-center text-meta text-ink-secondary">
              {t('読み込み中…')}
            </p>
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
                {t('もう一度試す')}
              </button>
            </div>
          ) : needsOnboarding ? (
            <OnboardingScreen create={create} errorKey={errorKey} />
          ) : (
            <>
              {profile && <AvatarNav profile={profile} />}
              <Outlet context={outletContext} />
              <BottomTabs />
            </>
          )}
          <PwaUpdatePrompt />
        </div>
      </SecretModeProvider>
    </OnlineProvider>
  );
}
/** シングルタップ判定用タイマーの遅延(spec-secret-mode-avatar-toggle Always)。 */
const AVATAR_TAP_WINDOW_MS = 300;
/**
 * 上部アバター(spec-secret-mode-avatar-toggle)。
 *
 * `useSecretMode()` を読むために独立コンポーネントにしている(`AppShell` の関数本体は、
 * これからレンダーする `SecretModeProvider` の外側にあたるため、そこで直接 `useSecretMode()`
 * を呼ぶと `defaultSecretModeState` が返ってしまう。`ConnectivityBar` が同じ理由で
 * 独立コンポーネントになっているのと同じ)。
 *
 * `<Link to="/profile">` のまま(アンカーとしての意味 -- 中クリック/Ctrl/Cmd/Shift+クリックでの
 * 新規タブ表示、スクリーンリーダーの「リンク」ロール、status bar の href 表示 -- を保つ)。
 * 修飾キー付き・非主ボタンのクリックは `preventDefault` せずネイティブ動作に任せ、
 * タップ判定ロジックも実行しない。通常の主ボタンクリックのときだけ `preventDefault` して
 * 下記のタップ判定に入る。
 *
 * シングル/ダブルタップ判定は明示的な `setTimeout`(約300ms)で行う。ネイティブの
 * `click`/`dblclick` 併用には頼らない(単発タップの `/profile` 遷移という取り消しにくい
 * 副作用を、ダブルタップのつもりのユーザーに対して誤発火させないため。Design Notes)。
 * 1回目のタップでタイマーを仕掛け、300ms 以内に2回目が来たらタイマーを止めてダブルタップ
 * 処理へ(`hasPasscode===false` → `/secret-mode`遷移 / `unlocked===true` → 即時 `lock()` /
 * それ以外 → クイック解除シートを開く)。来なければタイマー満了で `/profile` へ遷移する。
 * ダブルタップ確定直後は約300msのクールダウンを設け、その間の追加タップは無視する
 * (レビュー指摘: クールダウンが無いと3連続タップの3回目が新しい「1回目のタップ」として
 * 扱われ、意図せず`/profile`へ遷移してしまう)。アンマウント時は両タイマーとも
 * `clearTimeout`(`useEvents` の削除 Undo タイマーと同じパターン)。
 */
function AvatarNav({ profile }: { profile: Profile }) {
  useLanguage();
  const navigate = useNavigate();
  const { unlocked, hasPasscode, lock } = useSecretMode();
  const [quickUnlockOpen, setQuickUnlockOpen] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ダブルタップ確定直後のクールダウン中かどうか(3連続タップ対策)。
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    },
    [],
  );
  const handleTap = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      // 中クリック・Ctrl/Cmd/Shift+クリック等はネイティブ動作(新規タブ表示等)に任せる。
      return;
    }
    event.preventDefault();
    if (cooldownRef.current) {
      // ダブルタップ確定直後のクールダウン中の追加タップは無視する。
      return;
    }
    if (tapTimerRef.current !== null) {
      // 300ms 以内の2回目のタップ = ダブルタップ確定。保留中のシングルタップ用タイマー
      // (満了で /profile へ遷移する)を止め、/profile へは遷移させない。
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      cooldownRef.current = true;
      cooldownTimerRef.current = setTimeout(() => {
        cooldownRef.current = false;
        cooldownTimerRef.current = null;
      }, AVATAR_TAP_WINDOW_MS);
      if (!hasPasscode) {
        navigate('/secret-mode');
      } else if (unlocked) {
        lock();
      } else {
        setQuickUnlockOpen(true);
      }
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      navigate('/profile');
    }, AVATAR_TAP_WINDOW_MS);
  };
  return (
    <>
      <div className="flex justify-start px-4 pt-3">
        <Link
          to="/profile"
          onClick={handleTap}
          aria-label={t('プロフィール')}
          className="touch-manipulation inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
        >
          <AvatarIcon
            displayName={profile.displayName}
            avatarDataUrl={profile.avatarDataUrl}
          />
        </Link>
      </div>
      <SecretModeQuickUnlockSheet
        open={quickUnlockOpen}
        onClose={() => setQuickUnlockOpen(false)}
      />
    </>
  );
}
