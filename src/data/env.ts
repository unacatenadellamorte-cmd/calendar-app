/**
 * 環境変数の読み取りと検証を1か所に集約する(ARCHITECTURE-SPINE: 規約「設定の一元化」)。
 * クライアントに渡ってよいのは公開値のみ(Supabase の URL と anon key)。
 */

export interface AppEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  /** Supabase 接続に必要な値がすべて揃っているか。 */
  hasSupabase: boolean;
}

export function readEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;
  return {
    supabaseUrl,
    supabaseAnonKey,
    hasSupabase: Boolean(supabaseUrl && supabaseAnonKey),
  };
}

export const env: AppEnv = readEnv();
