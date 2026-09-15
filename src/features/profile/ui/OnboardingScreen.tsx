import { resolveMessage } from '@/data/messages';
import type { NewProfileInput } from '@/data/profiles';
import { ProfileForm } from './ProfileForm';

interface OnboardingScreenProps {
  /** `AppShell` の唯一の `useProfile()` インスタンスから渡される(自前で呼ばない)。 */
  create: (input: NewProfileInput) => Promise<boolean>;
  errorKey: string | null;
}

/**
 * 初回起動時、profiles 行がまだ無いユーザーに表示するオンボーディング。
 * `AppShell` が `<Outlet/>` の代わりに描画する(他の画面・下タブへは進めない)。
 */
export function OnboardingScreen({ create, errorKey }: OnboardingScreenProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-surface-sunken px-4 py-8">
      <h1 className="mb-1 text-title font-semibold text-ink-primary">ようこそ</h1>
      <p className="mb-6 text-meta text-ink-secondary">
        名前を登録してはじめましょう。写真は後からでも設定できます。
      </p>

      {errorKey && (
        <p role="alert" className="mb-4 text-meta text-danger">
          {resolveMessage(errorKey)}
        </p>
      )}

      <ProfileForm submitLabel="はじめる" onSubmit={create} />
    </div>
  );
}
