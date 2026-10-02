/// <reference types="vite/client" />
declare const __ADMOB_CONFIG__: import('../scripts/admob-config').AdsConfig;
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_ADMOB_PLATFORM?: 'android' | 'ios';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REVENUECAT_ANDROID_KEY?: string;
  readonly VITE_REVENUECAT_IOS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
