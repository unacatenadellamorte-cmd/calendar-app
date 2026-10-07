import { useCallback, useEffect, useState } from 'react';
import {
  createProfile,
  getProfile,
  updateProfile,
  type NewProfileInput,
  type Profile,
  type ProfilePatch,
} from '@/data/profiles';

/**
 * プロフィールの view-model(`useCalendars` と同型: enabled 引数、loading/errorKey/データ本体)。
 * 行がまだ無いユーザーは `profile === null`(エラーではない)。
 *
 * `AppShell` がオンボーディング判定に使う唯一のインスタンス(レビュー指摘: 画面ごとに
 * 別インスタンスを持つと状態が伝播しない)。`OnboardingScreen`/`ProfileScreen` は自前で
 * このフックを呼ばず、`AppShell` から props / Outlet context で受け取る。
 *
 * `errorKey` は reload/create/update いずれかの直近のエラー(フォーム内表示に使う)。
 * `loadErrorKey` は reload(初回取得含む)固有のエラーで、create/update では変化しない。
 * `AppShell` はこれを見て「取得失敗」と「行が無い(オンボーディング要)」を区別する。
 */
export function useProfile(enabled: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [initialLoadSettled, setInitialLoadSettled] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setErrorKey(null);
    setLoadErrorKey(null);
    const result = await getProfile();
    if (result.ok) {
      setProfile(result.value);
    } else {
      setErrorKey(result.error.messageKey);
      setLoadErrorKey(result.error.messageKey);
    }
    setInitialLoadSettled(true);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (input: NewProfileInput) => {
    const result = await createProfile(input);
    if (result.ok) {
      setProfile(result.value);
      setErrorKey(null);
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const update = useCallback(
    async (patch: ProfilePatch) => {
      if (!profile) return false;
      const result = await updateProfile(profile.id, patch);
      if (result.ok) {
        setProfile(result.value);
        setErrorKey(null);
        return true;
      }
      setErrorKey(result.error.messageKey);
      return false;
    },
    [profile],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  // 認証確定で有効になった最初の描画も、取得前の null を新規利用と判定させない。
  return {
    profile,
    loading: loading || (enabled && !initialLoadSettled),
    errorKey,
    loadErrorKey,
    reload,
    create,
    update,
    dismissError,
  };
}
