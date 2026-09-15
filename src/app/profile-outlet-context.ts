import type { Profile, ProfilePatch } from '@/data/profiles';

/**
 * `AppShell` が唯一の `useProfile()` インスタンスを持ち、`<Outlet context={...}>` で
 * 配下のルート(`ProfileScreen` 等)へ共有する(レビュー指摘: 画面ごとに別インスタンスの
 * `useProfile` を呼ぶと、片方での更新がもう片方に伝播しないバグになる)。
 */
export interface ProfileOutletContext {
  profile: Profile | null;
  loading: boolean;
  errorKey: string | null;
  update: (patch: ProfilePatch) => Promise<boolean>;
  reload: () => Promise<void>;
}
