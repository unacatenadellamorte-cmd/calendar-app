/**
 * RevenueCat Webhook のペイロードを「DB へ適用すべき変更」へ変換する純ロジック(CAP-2)。
 *
 * このモジュールは何も import しない。**このファイルが唯一の一次ソース**で、
 * `supabase/functions/_shared/revenuecat-webhook.ts` は `scripts/sync-edge-shared.mjs` が
 * ここから生成する(手で編集しない)。一致は `revenuecat-webhook.parity.test.ts` が保証する。
 * 秘匿情報は扱わない。
 *
 * 根拠(RevenueCat 公式ドキュメント、2026-10-02 確認):
 *   - ペイロードは `{ api_version, event: {...} }`。冪等のため event `id` を持つ。
 *   - EXPIRATION は「権利を外す」イベント。BILLING_ISSUE の後、猶予期間が無ければ即 EXPIRATION、
 *     猶予期間ありなら権利は維持され、回復すれば RENEWAL、尽きれば EXPIRATION。
 *   - PRODUCT_CHANGE は即時変更なら RENEWAL(App Store)/INITIAL_PURCHASE(Google Play)も同時に
 *     送られ、期末変更なら権利の入れ替えは次の RENEWAL まで遅れる。
 *   - TRANSFER は transferred_from / transferred_to のみで、entitlement_ids も期限も持たない。
 *   - 順序保証は文書に記載なし(at-least-once で重複あり)。→ event_timestamp_ms で逆転を防ぐ。
 */

/** 本アプリが扱う権利。DB の check 制約と一致させる。 */
export type EntitlementName = 'calendar_write' | 'multi_account';

const KNOWN_ENTITLEMENTS: readonly EntitlementName[] = ['calendar_write', 'multi_account'];

/** DB へ適用する 1 件の権利変更。 */
export interface EntitlementChange {
  userId: string;
  entitlement: EntitlementName;
  /** 有効期限(ISO)。null は無期限(本アプリの商品では出さない)。 */
  expiresAt: string | null;
  /** event 時点で有効なら true(期限が未来または null)。 */
  active: boolean;
  productId: string | null;
  store: string | null;
  /** event_timestamp_ms。順序逆転の判定に使う。 */
  eventAtMs: number;
}

/** TRANSFER(移転元の権利を移転先へ付け替える)。権利名・期限は DB 側が持つので ID だけ。 */
export interface EntitlementTransfer {
  fromUserId: string;
  toUserId: string;
  eventAtMs: number;
}

export interface WebhookPlan {
  changes: EntitlementChange[];
  transfers: EntitlementTransfer[];
  /** ログ用の分類(ユーザーID等の個人情報は含めない)。 */
  reason: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** 権利を付与(期限を保存)するイベント。 */
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** RevenueCat の store 名 → DB の store 値(既存コメント: google_play / app_store)。 */
export function normalizeStore(store: unknown): string | null {
  if (typeof store !== 'string' || store === '') return null;
  if (store === 'PLAY_STORE') return 'google_play';
  if (store === 'APP_STORE') return 'app_store';
  return store.toLowerCase();
}

function entitlementsOf(event: Record<string, unknown>): EntitlementName[] {
  const ids = event.entitlement_ids;
  if (!Array.isArray(ids)) return [];
  const out: EntitlementName[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && (KNOWN_ENTITLEMENTS as readonly string[]).includes(id)) {
      const name = id as EntitlementName;
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

function ignore(reason: string): WebhookPlan {
  return { changes: [], transfers: [], reason };
}

function buildChanges(
  event: Record<string, unknown>,
  userId: string,
  expiresAtMs: number,
  eventAtMs: number,
): EntitlementChange[] {
  const productId = typeof event.product_id === 'string' ? event.product_id : null;
  const store = normalizeStore(event.store);
  return entitlementsOf(event).map((entitlement) => ({
    userId,
    entitlement,
    expiresAt: new Date(expiresAtMs).toISOString(),
    active: expiresAtMs > eventAtMs,
    productId,
    store,
    eventAtMs,
  }));
}

/**
 * Webhook 本文 → 適用計画。例外は投げない(解釈できないものは「無視」= 呼び出し側は 200)。
 *
 * イベントごとの扱い:
 *   付与系(INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / SUBSCRIPTION_EXTENDED / REFUND_REVERSED)
 *     → entitlement_ids の各権利へ expiration_at_ms を保存。expiration_at_ms が無いものは無視
 *       (欠損を「無期限」と誤解釈しない)。
 *   EXPIRATION → 行は消さず expires_at を過去(expiration_at_ms、未来や欠損なら event 時刻)にする。
 *     行を残す理由: last_event_ms を保持でき、遅れて届いた古い RENEWAL が権利を復活させない。
 *   BILLING_ISSUE → grace_period_expiration_at_ms があり未来なら、その時刻まで権利を維持
 *     (猶予中は RevenueCat 上も権利が有効なのに、expiration_at_ms は過去の期末のままなので
 *     そのままだと DB 上で失効扱いになるため)。無ければ変更しない。
 *   CANCELLATION / PRODUCT_CHANGE / SUBSCRIPTION_PAUSED → 変更しない
 *     (自動更新停止なだけで期限までは有効。入れ替えや失効は RENEWAL / EXPIRATION が運ぶ)。
 *   TRANSFER → transferred_from の各 UUID から transferred_to の各 UUID へ付け替え。
 *   TEST / 未知のイベント / 非UUIDの app_user_id → 無視。
 */
export function planRevenueCatEvent(body: unknown): WebhookPlan {
  if (!isRecord(body) || !isRecord(body.event)) return ignore('invalid-body');
  const event = body.event;
  const type = event.type;
  if (typeof type !== 'string') return ignore('no-type');

  const eventAtMs = finiteNumber(event.event_timestamp_ms);

  if (type === 'TRANSFER') {
    if (eventAtMs === null) return ignore('no-event-time');
    const from = Array.isArray(event.transferred_from) ? event.transferred_from.filter(isUuid) : [];
    const to = Array.isArray(event.transferred_to) ? event.transferred_to.filter(isUuid) : [];
    const transfers: EntitlementTransfer[] = [];
    for (const f of from) {
      for (const t of to) {
        if (f.toLowerCase() !== t.toLowerCase()) {
          transfers.push({ fromUserId: f.toLowerCase(), toUserId: t.toLowerCase(), eventAtMs });
        }
      }
    }
    return transfers.length > 0
      ? { changes: [], transfers, reason: 'transfer' }
      : ignore('transfer-no-uuid');
  }

  const isGrant = GRANT_EVENTS.has(type);
  if (!isGrant && type !== 'EXPIRATION' && type !== 'BILLING_ISSUE') {
    // TEST・CANCELLATION・PRODUCT_CHANGE・SUBSCRIPTION_PAUSED・未知のイベント。
    return ignore(`noop:${type}`);
  }

  if (eventAtMs === null) return ignore('no-event-time');
  if (!isUuid(event.app_user_id)) return ignore('non-uuid-user');
  const userId = event.app_user_id.toLowerCase();

  if (isGrant) {
    const exp = finiteNumber(event.expiration_at_ms);
    if (exp === null) return ignore('grant-no-expiration');
    const changes = buildChanges(event, userId, exp, eventAtMs);
    return changes.length > 0 ? { changes, transfers: [], reason: 'grant' } : ignore('no-entitlement');
  }

  if (type === 'EXPIRATION') {
    const exp = finiteNumber(event.expiration_at_ms);
    const expiredAt = exp !== null && exp <= eventAtMs ? exp : eventAtMs;
    const changes = buildChanges(event, userId, expiredAt, eventAtMs);
    return changes.length > 0 ? { changes, transfers: [], reason: 'expire' } : ignore('no-entitlement');
  }

  // BILLING_ISSUE
  const grace = finiteNumber(event.grace_period_expiration_at_ms);
  if (grace === null || grace <= eventAtMs) return ignore('billing-issue-no-grace');
  const changes = buildChanges(event, userId, grace, eventAtMs);
  return changes.length > 0 ? { changes, transfers: [], reason: 'grace' } : ignore('no-entitlement');
}

/**
 * タイミング攻撃耐性のある文字列比較。長さの差も漏らさないよう、両者を SHA-256 にかけて
 * 固定長ダイジェストを定数時間で比較する(Web Crypto は Deno / Node 20+ の両方で使える)。
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}
