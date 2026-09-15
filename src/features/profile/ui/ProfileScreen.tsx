import { useOutletContext } from 'react-router-dom';
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
  const { state } = useAuth();
  const { profile, loading, errorKey, update } = useOutletContext<ProfileOutletContext>();

  if (state === 'unavailable') {
    return (
      <Screen title="プロフィール">
        <p className="text-body text-ink-secondary">
          ローカル開発では認証は無効です。Supabase を設定すると利用できます。
        </p>
      </Screen>
    );
  }

  if (loading || !profile) {
    return (
      <Screen title="プロフィール">
        <p className="text-meta text-ink-secondary">読み込み中…</p>
      </Screen>
    );
  }

  return (
    <Screen title="プロフィール">
      {errorKey && (
        <p role="alert" className="mb-4 text-meta text-danger">
          {resolveMessage(errorKey)}
        </p>
      )}
      <ProfileForm
        initialDisplayName={profile.displayName}
        initialAvatarDataUrl={profile.avatarDataUrl}
        submitLabel="保存する"
        onSubmit={update}
      />
    </Screen>
  );
}
