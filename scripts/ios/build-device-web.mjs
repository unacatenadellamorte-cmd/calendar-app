import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';

/** 端末で使う成果物は接続設定を必須にし、管理者キーの混入を防ぐ。 */
export function validateDeviceEnv(env) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('実機用ビルドにはSupabaseのURLと公開キーが必要です。');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('SupabaseのURLが不正です。'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Supabaseには認証情報を含まないHTTPSのルートURLを指定してください。');
  }
  if (!key.startsWith('sb_publishable_')) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { /* 下の検証で拒否する。 */ }
    if (key.split('.').length !== 3 || payload?.role !== 'anon') {
      throw new Error('Supabaseには公開用anonキーまたはpublishableキーだけを指定できます。');
    }
    if (payload.ref && parsed.hostname.endsWith('.supabase.co') && parsed.hostname !== `${payload.ref}.supabase.co`) {
      throw new Error('SupabaseのURLと公開キーのプロジェクトが一致していません。');
    }
  }
  return { url, key };
}

async function listFiles(root, relative = '') {
  const files = [];
  for (const entry of await readdir(resolve(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

export async function buildDeviceWeb() {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
  const { url, key } = validateDeviceEnv(env);
  // 形式検査だけでは失効・誤った公開キーを見分けられないため、読み取りAPIでも確認する。
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabaseの接続確認に失敗しました（HTTP ${response.status}）。`);
  const settings = await response.json();
  if (settings.external?.email !== true) throw new Error('Supabaseのメール認証が有効ではありません。');
  // 既存の実機archiveと一致するiOSテスト広告で固定する。
  Object.assign(process.env, {
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: key,
    VITE_ADMOB_PLATFORM: 'ios',
    VITE_ADMOB_MODE: 'test',
    ADMOB_IOS_APP_ID: 'ca-app-pub-3940256099942544~1458002511',
  });
  await build({ mode: 'production' });
  const names = await listFiles('dist');
  const files = {};
  let scripts = '';
  for (const name of names) {
    const bytes = await readFile(resolve('dist', name));
    files[name] = createHash('sha256').update(bytes).digest('hex');
    if (name.endsWith('.js')) scripts += bytes.toString('utf8');
  }
  if (!scripts.includes(url) || !scripts.includes(key)) throw new Error('接続設定がWeb成果物に組み込まれていません。');
  const ads = JSON.parse(await readFile('dist/admob-config.json', 'utf8'));
  if (ads.platform !== 'ios' || ads.mode !== 'test') throw new Error('実機archiveと広告設定が一致しません。');
  await writeFile('dist/ios-device-build.json', JSON.stringify({ schema: 1, supabaseConfigured: true, files }, null, 2) + '\n');
  console.log('iOS実機用Webビルド: Supabase接続設定と全資産のハッシュを検証済み。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildDeviceWeb().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
