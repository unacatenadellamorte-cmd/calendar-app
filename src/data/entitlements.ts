import { supabase } from './supabase';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';

/**
 * 有料機能の権利(entitlements)の data-access レイヤ(CAP-2 / CAP-5)。
 * すべて Result を返し、throw しない。snake↔camel 変換はここだけ。
 *
 * - RLS で自分の行だけ SELECT できる(書き込みは service_role = RevenueCat Webhook のみ)。
 * - `entitlements` には `deleted_at` が無い(行の有無と `expires_at` で状態を表す)ため、
 *   論理削除用の selectActive は通さず素の select を使う。
 * - クライアントの判定は表示の出し分けにだけ使う。権利の強制は Edge Function 側
 *   (oauth-exchange の接続上限など)で行う。
 */

export type EntitlementName = 'calendar_write' | 'multi_account';

export interface Entitlement {
  entitlement: EntitlementName;
  /** 有効期限(UTC ISO)。null は無期限。 */
  expiresAt: string | null;
}

interface EntitlementRow {
  entitlement: EntitlementName;
  expires_at: string | null;
}

const COLUMNS = 'entitlement,expires_at';

/** 自分の権利行をすべて返す(期限切れも含む。有効かどうかは呼び出し側で判定)。 */
export async function listMyEntitlements(): Promise<Result<Entitlement[]>> {
  if (!supabase) return err(appError('data/unavailable', 'data/unavailable'));
  try {
    const { data, error } = await supabase
      .from('entitlements')
      .select(COLUMNS)
      .returns<EntitlementRow[]>();
    if (error) {
      if (isNetworkError(error)) return err(appError('data/offline', 'data/offline', error));
      return err(appError('data/query', 'data/query', error));
    }
    return ok(
      (data ?? []).map((r) => ({ entitlement: r.entitlement, expiresAt: r.expires_at })),
    );
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/** `expires_at` が null(無期限)または `now` より後なら有効。 */
export function isEntitlementActive(entry: Entitlement, now: number = Date.now()): boolean {
  if (entry.expiresAt === null) return true;
  const expires = Date.parse(entry.expiresAt);
  return Number.isFinite(expires) && expires > now;
}
