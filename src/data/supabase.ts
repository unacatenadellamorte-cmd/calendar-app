import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, type AppEnv } from './env';

/*
 * Supabase クライアントは1つだけ生成する(ARCHITECTURE-SPINE AD-1 / AD-9)。
 * UI・hooks はこのモジュールを直接使わず、src/data のリポジトリ関数(後続ストーリー)経由で触る。
 * 環境変数が未設定でもアプリはクラッシュしない — 警告を1行出して null を返す。
 */

const MISSING_ENV_WARNING =
  '[calendar-app] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です。' +
  'Supabase 連携は無効のまま起動します。.env.local を用意してください(env.example 参照)。';

/**
 * 与えられた環境設定から Supabase クライアントを作る。
 * 未設定なら警告を1行出して null を返す(呼び出し側は分岐すること)。
 */
export function createSupabaseClient(appEnv: AppEnv): SupabaseClient | null {
  if (!appEnv.hasSupabase || !appEnv.supabaseUrl || !appEnv.supabaseAnonKey) {
    console.warn(MISSING_ENV_WARNING);
    return null;
  }
  return createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** 設定済みなら SupabaseClient、未設定なら null。 */
export const supabase: SupabaseClient | null = createSupabaseClient(env);

/** クライアントを要求する。未設定なら例外(呼び出し側は hasSupabase で事前に分岐すること)。 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase が未設定です。VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定してください。',
    );
  }
  return supabase;
}
