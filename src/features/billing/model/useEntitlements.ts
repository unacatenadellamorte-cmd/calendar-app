import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth-context';
import { accountScopeBlocked, accountScopeGeneration } from '@/data/account-scope';
import { env } from '@/data/env';
import { isEntitlementActive, listMyEntitlements, type Entitlement } from '@/data/entitlements';
import { cacheEntitlements, readCachedEntitlements } from '@/data/entitlement-cache';

export interface EntitlementFlags {
  hasMultiAccount: boolean;
  /** 本人のGoogle予定反映は標準機能。サーバーでも所有者と書込同意を検査する。 */
  canWrite: boolean;
  canViewPhotos: boolean;
  hasLegacyWrite: boolean;
  hasPaidPlan: boolean;
}
export interface EntitlementsState extends EntitlementFlags {
  loading: boolean;
  reload: () => void;
  refresh: () => Promise<EntitlementFlags | null>;
}

type Listener = (userId: string, rows: Entitlement[]) => void;
const listeners = new Set<Listener>();
const latestRequest = new Map<string, number>();
let nextRequest = 0;
const EMPTY: Entitlement[] = [];

/** 旧契約の有効期間と複数アカウント契約も写真表示を含む。 */
export function deriveEntitlements(rows: readonly Entitlement[], now = Date.now(), authenticated = true): EntitlementFlags {
  const active = new Set(authenticated ? rows.filter((row) => isEntitlementActive(row, now)).map((row) => row.entitlement) : []);
  const hasMultiAccount = active.has('multi_account');
  const hasLegacyWrite = active.has('calendar_write');
  const canViewPhotos = hasMultiAccount || hasLegacyWrite || active.has('device_photos');
  return { hasMultiAccount, canWrite: authenticated, canViewPhotos, hasLegacyWrite, hasPaidPlan: canViewPhotos };
}

/** DBを正とし、通信断だけは同じ利用者の確認済み期限付き権利を使う。 */
export function useEntitlements(): EntitlementsState {
  const { state, session } = useAuth();
  const userId = session?.user.id ?? null;
  const active = env.hasSupabase && state === 'authenticated' && userId !== null && !session?.user.is_anonymous;
  const identity = active ? userId : null;
  const currentIdentity = useRef(identity);
  const identityGeneration = useRef(0);
  if (currentIdentity.current !== identity) {
    currentIdentity.current = identity;
    identityGeneration.current += 1;
  }
  const [snapshot, setSnapshot] = useState<{ userId: string | null; rows: Entitlement[]; loading: boolean }>({ userId: identity, rows: [], loading: active });
  const [nonce, setNonce] = useState(0);
  const [clock, setClock] = useState(0);

  const refresh = useCallback(async () => {
    if (!identity) return null;
    const generation = identityGeneration.current;
    const scopeGeneration = accountScopeGeneration();
    const request = ++nextRequest;
    latestRequest.set(identity, request);
    const result = await listMyEntitlements();
    if (identity !== currentIdentity.current || generation !== identityGeneration.current || accountScopeBlocked() || scopeGeneration !== accountScopeGeneration() || latestRequest.get(identity) !== request) return null;
    const rows = result.ok ? result.value : result.error.kind === 'data/offline' ? readCachedEntitlements(identity) : [];
    if (result.ok) cacheEntitlements(identity, rows);
    else if (result.error.kind !== 'data/offline') cacheEntitlements(identity, []);
    listeners.forEach((listener) => listener(identity, rows));
    return result.ok ? deriveEntitlements(rows) : null;
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    const listener: Listener = (uid, rows) => {
      if (uid === currentIdentity.current) setSnapshot({ userId: uid, rows, loading: false });
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    setSnapshot((previous) => ({ userId: identity, rows: previous.userId === identity ? previous.rows : [], loading: true }));
    void refresh();
  }, [identity, nonce, refresh]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const rows = identity && snapshot.userId === identity ? snapshot.rows : EMPTY;
  // 画面が開いたままでも期限を越えたら写真を解放する。長い期限はタイマーを分割する。
  useEffect(() => {
    const next = rows.map((row) => Date.parse(row.expiresAt ?? '')).filter((time) => time > Date.now());
    if (!next.length) return;
    const timer = setTimeout(() => setClock((n) => n + 1), Math.min(Math.min(...next) - Date.now() + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [rows, clock]);
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'hidden') { setClock((n) => n + 1); reload(); }
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [reload]);

  return { loading: active && (snapshot.userId !== identity || snapshot.loading), ...deriveEntitlements(rows, Date.now(), active), reload, refresh };
}
