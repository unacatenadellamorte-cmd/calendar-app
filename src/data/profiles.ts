import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isNetworkError } from './net';

/**
 * プロフィール(表示名・アバター)の data-access レイヤ(ARCHITECTURE-SPINE AD-9 / AD-1)。
 * 真実源は Supabase Postgres。すべて Result を返し、throw しない。
 * snake_case(DB) ↔ camelCase(TS) 変換はこのファイルだけで行う。
 * 1ユーザー1行(profiles.id = auth.users.id、DB 側の default auth.uid() が発番)。
 * 削除・複数プロフィール切替はない(作成 / 更新のみ)。
 */

export interface Profile {
  id: string;
  displayName: string;
  avatarDataUrl: string | null;
}

export interface NewProfileInput {
  displayName: string;
  avatarDataUrl?: string | null;
}

export interface ProfilePatch {
  displayName?: string;
  avatarDataUrl?: string | null;
}

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_data_url: string | null;
}

const UNAVAILABLE = appError('data/unavailable', 'data/unavailable');
const COLUMNS = 'id,display_name,avatar_data_url';

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarDataUrl: row.avatar_data_url,
  };
}

function validateName(name: string): AppError | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return appError('profile/invalid-name', 'profile/invalid-name');
  }
  return null;
}

/** 自分のプロフィールを返す。行がまだ無ければエラーではなく null。 */
export async function getProfile(): Promise<Result<Profile | null>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(COLUMNS)
      .maybeSingle<ProfileRow>();
    if (error) return err(appError('data/query', 'data/query', error));
    return ok(data ? toProfile(data) : null);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/** オンボーディングでの新規作成。id は DB 側の default auth.uid() が入れる。 */
export async function createProfile(input: NewProfileInput): Promise<Result<Profile>> {
  if (!supabase) return err(UNAVAILABLE);
  const nameError = validateName(input.displayName);
  if (nameError) return err(nameError);

  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        display_name: input.displayName.trim(),
        avatar_data_url: input.avatarDataUrl ?? null,
      })
      .select(COLUMNS)
      .single<ProfileRow>();
    if (error) {
      // 同時作成(2タブ・二重クリック等)で主キー(id = auth.uid())が衝突した場合は、
      // 汎用エラーにせず既存行の取得にフォールバックする。
      if (error.code === '23505') {
        const existing = await getProfile();
        if (existing.ok && existing.value) return ok(existing.value);
      }
      return err(appError('data/query', 'data/query', error));
    }
    return ok(toProfile(data));
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/** プロフィール編集画面からの更新。RLS が自分の1行だけに絞る。 */
export async function updateProfile(patch: ProfilePatch): Promise<Result<Profile>> {
  if (!supabase) return err(UNAVAILABLE);
  const dbPatch: Record<string, unknown> = {};
  if (patch.displayName !== undefined) {
    const nameError = validateName(patch.displayName);
    if (nameError) return err(nameError);
    dbPatch.display_name = patch.displayName.trim();
  }
  if (patch.avatarDataUrl !== undefined) {
    dbPatch.avatar_data_url = patch.avatarDataUrl;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(dbPatch)
      .select(COLUMNS)
      .single<ProfileRow>();
    if (error) return err(appError('data/query', 'data/query', error));
    return ok(toProfile(data));
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}
