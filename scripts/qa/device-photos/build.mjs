// 製品のdistとは別の一時フォルダーへ出す。配布用成果物には混ぜない。
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const root = process.cwd();
const outDir = await mkdtemp(resolve(tmpdir(), 'multi-calendar-photo-qa-'));
await build({ configFile: false, root, mode: 'test', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(root, 'src'), '@core': resolve(root, 'packages/core/src/index.ts') } },
  build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, 'scripts/qa/device-photos/index.html') } },
});
console.log(`検証専用の出力先: ${outDir}`);
