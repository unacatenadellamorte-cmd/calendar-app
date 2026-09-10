/**
 * 環境変数の読み取りと検証を1か所に集約する(ARCHITECTURE-SPINE: 規約「設定の一元化」)。
 * クライアントに渡ってよいのは公開値のみ(Supabase の URL / anon key、OAuth クライアント ID)。
 * OAuth クライアントシークレットは Edge Function の関数シークレットにのみ置く(AD-3)。
 */

export interface AppEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  /** Supabase 接続に必要な値がすべて揃っているか。 */
  hasSupabase: boolean;
  /** Google OAuth クライアント ID(公開値)。Story 3.1。 */
  googleOauthClientId: string | undefined;
  /** Google 接続フローを出せるか(client ID が設定済み)。 */
  hasGoogleOauth: boolean;
}

export function readEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;
  const googleOauthClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim() || undefined;
  return {
    supabaseUrl,
    supabaseAnonKey,
    hasSupabase: Boolean(supabaseUrl && supabaseAnonKey),
    googleOauthClientId,
    hasGoogleOauth: Boolean(googleOauthClientId),
  };
}

export const env: AppEnv = readEnv();
