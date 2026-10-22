// 製品のdistとは別の一時フォルダーへ出す。配布用成果物には混ぜない。
import { build, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { resolveAdsConfig } from '../../admob-config.ts';
const root = process.cwd();
const outDir = await mkdtemp(resolve(tmpdir(), 'multi-calendar-photo-qa-'));
// vite.config.ts と同じ広告設定の解決(テストID)。configFile:false では define が入らず白画面になるため、ここで渡す。
const env = { ...loadEnv('test', root, ''), ...process.env };
await build({ configFile: false, root, mode: 'test', plugins: [react(), tailwindcss()],
  define: { __ADMOB_CONFIG__: JSON.stringify(resolveAdsConfig(env)) },
  // 検証専用: 写真の権利の判定だけを fixture へ向ける。完全一致のみで、@ の汎用 alias より先に置く。
  resolve: { alias: {
    '@/features/billing/model/useEntitlements': resolve(root, 'scripts/qa/device-photos/entitlements.ts'),
    // QAの写真画面はAuthProviderを置かないため、CTAのPlanSheet→usePurchaseが落ちないよう未設定相当の認証を渡す。
    '@/app/auth-context': resolve(root, 'scripts/qa/device-photos/auth-context.ts'),
    '@': resolve(root, 'src'),
    '@core': resolve(root, 'packages/core/src/index.ts'),
  } },
  build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, 'scripts/qa/device-photos/index.html') } },
});
console.log(`検証専用の出力先: ${outDir}`);
