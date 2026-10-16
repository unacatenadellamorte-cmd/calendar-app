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
  status: 'idle' | 'configuring' | 'ready' | 'error';
  messageKey?: string;
}

let snapshot: PurchasesSnapshot = { userId: null, status: 'idle' };
let isConfigured = false;
let sdkUserId: string | null | undefined = null;
let requestedUserId: string | null = null;
let generation = 0;
let loadedPackages: PurchasesPackage[] | null = null;
const listeners = new Set<() => void>();

function publish(next: PurchasesSnapshot): void {
  snapshot = next;
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
  sdkUserId = requestedUserId = null;
  generation += 1;
  loadedPackages = null;
  queue = Promise.resolve();
  publish({ userId: null, status: 'idle' });
}

// ---- エラー変換 ----

function isCancelled(error: unknown): boolean {
  const e = error as { code?: unknown; userCancelled?: unknown } | null;
  return (
    e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || e?.userCancelled === true
  );
}

function failure(kind: string, messageKey: string, cause: unknown, stage = kind) {
  const code = (cause as { code?: unknown } | null)?.code;
  // 例外本文・ユーザーID・キー・レシートはログへ出さない。
  const safeCode = Object.values(PURCHASES_ERROR_CODE).includes(code as PURCHASES_ERROR_CODE)
    ? code
    : 'unknown';
  console.warn('課金処理', { stage, code: safeCode });
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
  if (snapshot.status === 'ready' && snapshot.userId === userId)
    return Promise.resolve(ok(undefined));
  requestedUserId = userId;
  const request = ++generation;
  loadedPackages = null;
  publish({ userId: null, status: userId ? 'configuring' : 'idle' });
  return serialize(async () => {
    if (request !== generation) return unavailable();
    const apiKey = sdkKey();
    if (!apiKey) return unavailable();
    let stage = 'configure';
    try {
      if (userId === null) {
        stage = 'logout';
        if (isConfigured && sdkUserId !== null) {
          await Purchases.logOut();
          sdkUserId = null;
        }
        return ok(undefined);
      }
      if (!isConfigured) {
        await Purchases.configure({ apiKey, appUserID: userId });
        isConfigured = true;
        sdkUserId = userId;
        if (request !== generation) return unavailable();
        publish({ userId, status: 'ready' });
        return ok(undefined);
      }
      if (sdkUserId !== userId) {
        stage = 'login';
        await Purchases.logIn({ appUserID: userId });
        sdkUserId = userId;
      }
      if (request !== generation) return unavailable();
      publish({ userId, status: 'ready' });
      return ok(undefined);
    } catch (e) {
      // SDK側で部分的に切り替わった可能性があるため、次回は必ず紐付け直す。
      if (isConfigured) sdkUserId = undefined;
      const result = failure(
        'purchase/configure-failed',
        'purchase/configure-failed',
        e,
        stage,
      );
      if (request === generation && !result.ok)
        publish({ userId: null, status: 'error', messageKey: result.error.messageKey });
      return result;
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

function findPackage(
  packages: PurchasesPackage[],
  plan: EntitlementName,
): PurchasesPackage | null {
  return packages.find((p) => matchesProduct(p, PRODUCT_IDS[plan])) ?? null;
}

export type PlanPriceStrings = Partial<Record<EntitlementName, string>>;

/** ストアのローカライズ済み価格文字列。商品が見つからないプランは購入不可。 */
export async function getPlanPrices(): Promise<Result<PlanPriceStrings>> {
  const request = generation;
  return serialize(async () => {
    if (!purchasesSupported() || snapshot.userId === null || request !== generation)
      return unavailable();
    loadedPackages = null;
    try {
      const packages = collectPackages(await Purchases.getOfferings());
      if (request !== generation) return unavailable();
      loadedPackages = packages;
      const prices: PlanPriceStrings = {};
      for (const plan of Object.keys(PRODUCT_IDS) as EntitlementName[]) {
        const pkg = findPackage(packages, plan);
        if (pkg?.product.priceString) prices[plan] = pkg.product.priceString;
      }
      return ok(prices);
    } catch (e) {
      return failure('purchase/offerings-failed', 'purchase/offerings-failed', e);
    }
  });
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
      customerInfo.activeSubscriptions.find((id) => id === old || id.startsWith(`${old}:`)) ??
      null
    );
  }
}

/** プランを購入する。ユーザーのキャンセルはエラーにせず `cancelled` を返す。 */
export async function purchasePlan(
  plan: EntitlementName,
  expectedUserId = snapshot.userId,
): Promise<Result<PurchaseOutcome>> {
  const request = generation;
  return serialize(async () => {
    const valid = () =>
      purchasesSupported() &&
      expectedUserId !== null &&
      snapshot.userId === expectedUserId &&
      requestedUserId === expectedUserId &&
      request === generation;
    if (!valid()) return unavailable();
    let stage = 'offerings';
    try {
      const packages = loadedPackages ?? collectPackages(await Purchases.getOfferings());
      if (!valid()) return unavailable();
      const aPackage = findPackage(packages, plan);
      if (!aPackage) {
        return err(appError('purchase/product-missing', 'purchase/product-missing'));
      }
      stage = 'previous-subscription';
      const oldProductIdentifier = await findOldProductId(plan);
      if (!valid()) return unavailable();
      stage = 'store-purchase';
      await Purchases.purchasePackage({
        aPackage,
        ...(oldProductIdentifier ? { storeProductChangeInfo: { oldProductIdentifier } } : {}),
      });
      if (!valid()) return unavailable();
      return ok('purchased');
    } catch (e) {
      if (isCancelled(e)) return ok('cancelled');
      return failure('purchase/failed', 'purchase/failed', e, stage);
    }
  });
}

// ---- 復元・管理 ----

export interface RestoreOutcome {
  /** 復元後、ストア側に有効な購読があるか(customerInfo.activeSubscriptions)。表示の補助のみ。 */
  hasActiveSubscription: boolean;
}

export async function restorePurchases(): Promise<Result<RestoreOutcome>> {
  const request = generation;
  return serialize(async () => {
    if (!purchasesSupported() || snapshot.userId === null || request !== generation)
      return unavailable();
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      if (request !== generation) return unavailable();
      return ok({ hasActiveSubscription: customerInfo.activeSubscriptions.length > 0 });
    } catch (e) {
      return failure('purchase/restore-failed', 'purchase/restore-failed', e);
    }
  });
}

/** ストアの購読管理ページ。有効な購読が無いと null(型定義の仕様)。 */
export async function getManagementUrl(): Promise<Result<string | null>> {
  const request = generation;
  return serialize(async () => {
    if (!purchasesSupported() || snapshot.userId === null || request !== generation)
      return unavailable();
    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      if (request !== generation) return unavailable();
      // 別OSで開始した購読でも、iOSから他ストアへ誘導しない。
      if (currentPlatform() === 'ios' && customerInfo.managementURL) {
        return ok('https://apps.apple.com/account/subscriptions');
      }
      return ok(customerInfo.managementURL);
    } catch (e) {
      return failure('purchase/management-failed', 'purchase/management-failed', e);
    }
  });
}
