// revenuecat-webhook — RevenueCat の Webhook を受けて entitlements を更新する(CAP-2)。
//
// RevenueCat が呼ぶので Supabase ゲートウェイの JWT 検証は外してある
// (supabase/config.toml の [functions.revenuecat-webhook] verify_jwt = false)。
// 代わりに Authorization ヘッダを関数シークレット REVENUECAT_WEBHOOK_AUTH と
// タイミング攻撃耐性のある比較で照合する。
//
// 応答方針(RevenueCat は 200 以外で再送する):
//   - 認証不一致 401 / シークレット未設定 500 / 本文が JSON でない 400(再送しても直らない)
//   - 無視してよいイベント(TEST・匿名ID・未知のイベント・古いイベント)は 200
//   - DB 失敗は 500(再送させる)
//
// ユーザーID・メール・ヘッダ値・本文はログに出さない。
// 必要な関数シークレット: REVENUECAT_WEBHOOK_AUTH(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は自動注入)

import { createClient } from 'jsr:@supabase/supabase-js@2';
// 純ロジックの一次ソースは packages/core/src/revenuecat-webhook.ts。
// この _shared/revenuecat-webhook.ts は scripts/sync-edge-shared.mjs が生成する(手で編集しない)。
import { constantTimeEqual, planRevenueCatEvent } from '../_shared/revenuecat-webhook.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!expected || !supabaseUrl || !serviceRoleKey) {
    console.error('revenuecat-webhook: missing env');
    return json({ error: 'server-misconfigured' }, 500);
  }

  const provided = req.headers.get('Authorization') ?? '';
  if (!(await constantTimeEqual(provided, expected))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad-request' }, 400);
  }

  const plan = planRevenueCatEvent(body);
  if (plan.changes.length === 0 && plan.transfers.length === 0) {
    return json({ ok: true, ignored: plan.reason });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let applied = 0;
  let skipped = 0;
  for (const c of plan.changes) {
    const { data, error } = await admin.rpc('apply_revenuecat_entitlement', {
      p_user_id: c.userId,
      p_entitlement: c.entitlement,
      p_expires_at: c.expiresAt,
      p_product_id: c.productId,
      p_store: c.store,
      p_event_ms: c.eventAtMs,
    });
    if (error) {
      console.error('revenuecat-webhook: rpc failed', error.code ?? '');
      return json({ error: 'apply-failed' }, 500);
    }
    if (data === true) applied++;
    else skipped++;
  }
  for (const t of plan.transfers) {
    const { data, error } = await admin.rpc('apply_revenuecat_transfer', {
      p_from: t.fromUserId,
      p_to: t.toUserId,
      p_event_ms: t.eventAtMs,
    });
    if (error) {
      console.error('revenuecat-webhook: transfer rpc failed', error.code ?? '');
      return json({ error: 'apply-failed' }, 500);
    }
    if (data === true) applied++;
    else skipped++;
  }

  console.log(`revenuecat-webhook: ${plan.reason} applied=${applied} skipped=${skipped}`);
  return json({ ok: true, applied, skipped });
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (e) {
    console.error('revenuecat-webhook: unhandled', (e as Error)?.message);
    return json({ error: 'internal' }, 500);
  }
});
