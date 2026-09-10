import { supabase } from './supabase';
import { appError, err, ok, type AppError, type Result } from './result';
import { isNetworkError } from './net';

/**
 * Edge Function 呼び出しの共通ラッパ(Story 3.1〜)。
 * supabase-js は非2xx を throw せず `{ error }` で返す:
 *  - FunctionsHttpError … 関数が非2xx。`.context`(Response)本文の `{ error: <slug> }` を messageKey へ
 *  - FunctionsFetchError … 関数へ到達できない → data/offline
 * `slugToKey` で関数側の slug(例 'reauth-needed')をアプリの messageKey(例 'connection/reauth-needed')へ写像する。
 */
export async function invokeFn<T>(
  name: string,
  payload: Record<string, unknown>,
  slugToKey: (slug: string) => string,
  fallbackKey: string,
): Promise<Result<T>> {
  if (!supabase) return err(appError('connection/unavailable', 'connection/unavailable'));
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body: payload });
    if (error) {
      const kind = (error as { name?: string }).name;
      if (kind === 'FunctionsFetchError' || isNetworkError(error)) {
        return err(appError('data/offline', 'data/offline', error));
      }
      return err(await mapFunctionError(error, slugToKey, fallbackKey));
    }
    return ok(data as T);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError(fallbackKey, fallbackKey, e));
  }
}

async function mapFunctionError(
  error: unknown,
  slugToKey: (slug: string) => string,
  fallbackKey: string,
): Promise<AppError> {
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      const slug = typeof body?.error === 'string' ? body.error : '';
      if (slug) {
        const key = slugToKey(slug);
        return appError(key, key, error);
      }
    } catch {
      /* フォールスルー */
    }
  }
  return appError(fallbackKey, fallbackKey, error);
}
