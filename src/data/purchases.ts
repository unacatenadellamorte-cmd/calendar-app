import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
  type PurchasesOffering,
} from '@revenuecat/purchases-capacitor';
import { env } from './env';
import { appError, err, ok, type Result } from './result';
import type { EntitlementName } from './entitlements';

/**
 * 課金(RevenueCat SDK)の data-access レイヤ(CAP-1 / CAP-5)。Result を返し、throw しない。
 *
 * - 有効になるのは Capacitor のプラットフォームが android / ios で、かつ公開 SDK キー
 *   (VITE_REVENUECAT_ANDROID_KEY / VITE_REVENUECAT_IOS_KEY)がある場合だけ。
 *   Web・キー未設定は「利用不可」(UI は従来どおり「準備中」)。
 * - 権利の真実の源はサーバー(RevenueCat → Webhook → entitlements)。ここで得る
 *   customerInfo は「購入が通ったか」「購読があるか」の補助にだけ使い、権利判定はしない。
 * - `appUserID` は Supabase の auth.users.id。ゲスト(匿名)では呼ばない(呼び出し側で制御)。
 */

/** 商品ID(ストア共通)。プランの権利名との対応。 */
export const PRODUCT_IDS: Record<EntitlementName, string> = {
  calendar_write: 'calendar_write_monthly',
  multi_account: 'multi_account_monthly',
};

type Platform = 'android' | 'ios';

function currentPlatform(): Platform | null {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

function sdkKey(): string | undefined {
  const platform = currentPlatform();
  if (platform === 'android') return env.revenueCatAndroidKey;
  if (platform === 'ios') return env.revenueCatIosKey;
  return undefined;
}

/** SDK を使える環境か(ネイティブ + 公開キーあり)。 */
export function purchasesSupported(): boolean {
  return Boolean(sdkKey());
}

// ---- 設定状態(ストア) ----

export interface PurchasesSnapshot {
  /** configure 済みで、いま RevenueCat 側に紐づいているユーザーID。ログアウト状態は null。 */
  userId: string | null;
}

let snapshot: PurchasesSnapshot = { userId: null };
let isConfigured = false;
const listeners = new Set<() => void>();

function setUserId(userId: string | null): void {
  snapshot = { userId };
  listeners.forEach((listener) => listener());
}

export function subscribePurchases(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPurchasesSnapshot(): PurchasesSnapshot {
  return snapshot;
}

/** テスト用: モジュール内の状態を初期化する。 */
export function resetPurchasesForTest(): void {
  isConfigured = false;
  queue = Promise.resolve();
  setUserId(null);
}

// ---- エラー変換 ----

function isCancelled(error: unknown): boolean {
  const e = error as { code?: unknown; userCancelled?: unknown } | null;
  return e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || e?.userCancelled === true;
}

function failure(kind: string, messageKey: string, cause: unknown) {
  const code = (cause as { code?: unknown } | null)?.code;
  if (code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    return err(appError('purchase/offline', 'purchase/offline', cause));
  }
  if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    return err(appError('purchase/pending', 'purchase/pending', cause));
  }
  return err(appError(kind, messageKey, cause));
}

const unavailable = () => err(appError('purchase/unavailable', 'purchase/unavailable'));

// ---- configure / logIn / logOut(直列化) ----

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * ログイン済みユーザーに RevenueCat を合わせる。
 * - 初回の userId: configure({ apiKey, appUserID })
 * - 設定済みで別の userId: logIn
 * - userId が null(ログアウト・ゲスト): 設定済みなら logOut(匿名IDに戻す)
 * 同じ userId で何度呼んでも何もしない。
 */
export function configurePurchases(userId: string | null): Promise<Result<void>> {
  return serialize(async () => {
    const apiKey = sdkKey();
    if (!apiKey) return unavailable();
    try {
      if (userId === null) {
        if (isConfigured && snapshot.userId !== null) {
          await Purchases.logOut();
          setUserId(null);
        }
        return ok(undefined);
      }
      if (!isConfigured) {
        await Purchases.configure({ apiKey, appUserID: userId });
        isConfigured = true;
        setUserId(userId);
        return ok(undefined);
      }
      if (snapshot.userId !== userId) {
        await Purchases.logIn({ appUserID: userId });
        setUserId(userId);
      }
      return ok(undefined);
    } catch (e) {
      return err(appError('purchase/configure-failed', 'purchase/configure-failed', e));
    }
  });
}

// ---- オファリング ----

function collectPackages(offerings: {
  current: PurchasesOffering | null;
  all: Record<string, PurchasesOffering>;
}): PurchasesPackage[] {
  if (offerings.current) return offerings.current.availablePackages;
  return Object.values(offerings.all).flatMap((o) => o.availablePackages);
}

/**
 * パッケージの商品が対象の商品IDか。Android では `subscriptionId:basePlanId` の形になる
 * 可能性があるため、前方一致(`id` または `id:...`)で見る。
 * (Android の StoreProduct.identifier の厳密な形式は型定義から確認できていない。)
 */
function matchesProduct(pkg: PurchasesPackage, productId: string): boolean {
  const id = pkg.product.identifier;
  return id === productId || id.startsWith(`${productId}:`);
}

function findPackage(packages: PurchasesPackage[], plan: EntitlementName): PurchasesPackage | null {
  return packages.find((p) => matchesProduct(p, PRODUCT_IDS[plan])) ?? null;
}

export type PlanPriceStrings = Partial<Record<EntitlementName, string>>;

/** ストアのローカライズ済み価格文字列。商品が見つからないプランは含めない(仮表示のまま)。 */
export async function getPlanPrices(): Promise<Result<PlanPriceStrings>> {
  if (!purchasesSupported() || snapshot.userId === null) return unavailable();
  try {
    const packages = collectPackages(await Purchases.getOfferings());
    const prices: PlanPriceStrings = {};
    for (const plan of Object.keys(PRODUCT_IDS) as EntitlementName[]) {
      const pkg = findPackage(packages, plan);
      if (pkg) prices[plan] = pkg.product.priceString;
    }
    return ok(prices);
  } catch (e) {
    return failure('purchase/offerings-failed', 'purchase/offerings-failed', e);
  }
}

// ---- 購入 ----

export type PurchaseOutcome = 'purchased' | 'cancelled';

/**
 * Android でプラン変更(予定反映 → 複数アカウント)のときに渡す旧商品ID。
 * RevenueCat のドキュメントは oldProductID を CustomerInfo から取る形を案内している
 * (購読の ID を CustomerInfo の値のまま渡す)。見つからなければ null。
 */
async function findOldProductId(plan: EntitlementName): Promise<string | null> {
  if (plan !== 'multi_account' || currentPlatform() !== 'android') return null;
  {
    // 旧契約の確認失敗を未契約扱いにすると二重契約になるため、例外は購入処理へ返す。
    const { customerInfo } = await Purchases.getCustomerInfo();
    const old = PRODUCT_IDS.calendar_write;
    return (
      customerInfo.activeSubscriptions.find((id) => id === old || id.startsWith(`${old}:`)) ?? null
    );
  }
}

/** プランを購入する。ユーザーのキャンセルはエラーにせず `cancelled` を返す。 */
export async function purchasePlan(plan: EntitlementName): Promise<Result<PurchaseOutcome>> {
  if (!purchasesSupported() || snapshot.userId === null) return unavailable();
  try {
    const packages = collectPackages(await Purchases.getOfferings());
    const aPackage = findPackage(packages, plan);
    if (!aPackage) {
      return err(appError('purchase/product-missing', 'purchase/product-missing'));
    }
    const oldProductIdentifier = await findOldProductId(plan);
    await Purchases.purchasePackage({
      aPackage,
      ...(oldProductIdentifier ? { storeProductChangeInfo: { oldProductIdentifier } } : {}),
    });
    return ok('purchased');
  } catch (e) {
    if (isCancelled(e)) return ok('cancelled');
    return failure('purchase/failed', 'purchase/failed', e);
  }
}

// ---- 復元・管理 ----

export interface RestoreOutcome {
  /** 復元後、ストア側に有効な購読があるか(customerInfo.activeSubscriptions)。表示の補助のみ。 */
  hasActiveSubscription: boolean;
}

export async function restorePurchases(): Promise<Result<RestoreOutcome>> {
  if (!purchasesSupported() || snapshot.userId === null) return unavailable();
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return ok({ hasActiveSubscription: customerInfo.activeSubscriptions.length > 0 });
  } catch (e) {
    return failure('purchase/restore-failed', 'purchase/restore-failed', e);
  }
}

/** ストアの購読管理ページ。有効な購読が無いと null(型定義の仕様)。 */
export async function getManagementUrl(): Promise<Result<string | null>> {
  if (!purchasesSupported() || snapshot.userId === null) return unavailable();
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return ok(customerInfo.managementURL);
  } catch (e) {
    return failure('purchase/management-failed', 'purchase/management-failed', e);
  }
}
