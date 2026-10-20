import { t, useLanguage } from '@/i18n';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import type { ProfileOutletContext } from '@/app/profile-outlet-context';
import { ProfileForm } from './ProfileForm';
/**
 * プロフィール編集画面(タブ外、上部アバターから遷移)。
 * オンボーディングと同じ `ProfileForm` を編集用に再利用する。
 * `profile`/`update` は `AppShell` の唯一の `useProfile()` インスタンスを
 * `<Outlet context>` 経由で受け取る(自前で `useProfile` を呼ばない。レビュー指摘:
 * 別インスタンスにすると、ここでの更新が上部アバターに反映されない)。
 */
export function ProfileScreen() {
  useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useAuth();
  const { profile, loading, errorKey, update } = useOutletContext<ProfileOutletContext>();
  const from: unknown = location.state?.profileReturnTo;
  // 入口で渡されたアプリ内の戻り先だけを使い、直接起動時は設定へ戻す。
  const hasReturnTo =
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    from.split(/[?#]/, 1)[0] !== '/profile';
  const returnTo = hasReturnTo ? from : '/settings';
  const backAction = (
    <Link
      to={returnTo}
      replace
      onClick={(event) => {
        if (
          hasReturnTo &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          navigate(-1);
        }
      }}
      className="inline-flex min-h-11 items-center gap-1 rounded-sm px-3 text-body text-accent"
    >
      <span aria-hidden="true">‹</span>
      {t('戻る')}
    </Link>
  );
  if (state === 'unavailable') {
    return (
      <Screen title={t('プロフィール')} action={backAction}>
        <p className="text-body text-ink-secondary">
          {t('ローカル開発では認証は無効です。Supabase を設定すると利用できます。')}
        </p>
      </Screen>
    );
  }
  if (loading || !profile) {
    return (
      <Screen title={t('プロフィール')} action={backAction}>
        <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
      </Screen>
    );
  }
  return (
    <Screen title={t('プロフィール')} action={backAction}>
      {errorKey && (
        <p role="alert" className="mb-4 text-meta text-danger">
          {resolveMessage(errorKey)}
        </p>
      )}
      <ProfileForm
        initialDisplayName={profile.displayName}
        initialAvatarDataUrl={profile.avatarDataUrl}
        submitLabel={t('保存する')}
        onSubmit={update}
      />
    </Screen>
  );
}
