import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * purchases.ts の検証。プラグイン(@revenuecat/purchases-capacitor)と Capacitor の
 * プラットフォーム判定・公開キーをモックする。エラーコード列挙は実物を使う。
 */

const plugin = {
  configure: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  getOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  getCustomerInfo: vi.fn(),
};
let platform = 'android';
let envValue: { revenueCatAndroidKey?: string; revenueCatIosKey?: string } = {
  revenueCatAndroidKey: 'goog_public_key',
  revenueCatIosKey: 'appl_public_key',
};

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => platform } };
});
vi.mock('./env', () => ({
  get env() {
    return envValue;
  },
}));
vi.mock('@revenuecat/purchases-capacitor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@revenuecat/purchases-capacitor')>();
  return { ...actual, Purchases: plugin };
});

const purchases = await import('./purchases');
const { PURCHASES_ERROR_CODE } = await import('@revenuecat/purchases-capacitor');

const pkg = (identifier: string, priceString: string) => ({
  identifier: `$rc_${identifier}`,
  presentedOfferingContext: {
    offeringIdentifier: 'default',
    placementIdentifier: null,
    targetingContext: null,
  },
  product: { identifier, priceString },
});
const offerings = {
  current: {
    availablePackages: [
      pkg('calendar_write_monthly', '¥300'),
      pkg('multi_account_monthly:base', '¥1,000'),
    ],
  },
  all: {},
};

beforeEach(() => {
  Object.values(plugin).forEach((fn) => fn.mockReset());
  plugin.configure.mockResolvedValue(undefined);
  plugin.logIn.mockResolvedValue({ customerInfo: {}, created: false });
  plugin.logOut.mockResolvedValue({ customerInfo: {} });
  plugin.getOfferings.mockResolvedValue(offerings);
  plugin.purchasePackage.mockResolvedValue({ productIdentifier: 'x', customerInfo: {} });
  plugin.getCustomerInfo.mockResolvedValue({
    customerInfo: { activeSubscriptions: [], managementURL: null },
  });
  plugin.restorePurchases.mockResolvedValue({ customerInfo: { activeSubscriptions: [] } });
  platform = 'android';
  envValue = { revenueCatAndroidKey: 'goog_public_key', revenueCatIosKey: 'appl_public_key' };
  purchases.resetPurchasesForTest();
});

describe('利用可否', () => {
  it('Web では公開キーがあっても利用不可で、SDK を呼ばない', async () => {
    platform = 'web';
    expect(purchases.purchasesSupported()).toBe(false);
    const r = await purchases.configurePurchases('u1');
    expect(r.ok).toBe(false);
    expect(plugin.configure).not.toHaveBeenCalled();
    expect((await purchases.purchasePlan('multi_account')).ok).toBe(false);
  });
  it('ネイティブでもキー未設定なら利用不可', async () => {
    envValue = {};
    expect(purchases.purchasesSupported()).toBe(false);
    expect((await purchases.configurePurchases('u1')).ok).toBe(false);
    expect(plugin.configure).not.toHaveBeenCalled();
  });
  it('プラットフォームごとのキーを使う', async () => {
    platform = 'ios';
    await purchases.configurePurchases('u1');
    expect(plugin.configure).toHaveBeenCalledWith({
      apiKey: 'appl_public_key',
      appUserID: 'u1',
    });
  });
  it('configure 前は価格・購入・復元・管理が利用不可エラー', async () => {
    for (const r of [
      await purchases.getPlanPrices(),
      await purchases.purchasePlan('calendar_write'),
      await purchases.restorePurchases(),
      await purchases.getManagementUrl(),
    ]) {
      expect(r).toMatchObject({ ok: false, error: { messageKey: 'purchase/unavailable' } });
    }
  });
});

describe('configure / logIn / logOut', () => {
  it('初回は configure、同じユーザーでは再実行しない', async () => {
    await purchases.configurePurchases('u1');
    await purchases.configurePurchases('u1');
    expect(plugin.configure).toHaveBeenCalledTimes(1);
    expect(plugin.configure).toHaveBeenCalledWith({
      apiKey: 'goog_public_key',
      appUserID: 'u1',
    });
    expect(plugin.logIn).not.toHaveBeenCalled();
    expect(purchases.getPurchasesSnapshot().userId).toBe('u1');
  });
  it('ユーザーが替わったら logIn', async () => {
    await purchases.configurePurchases('u1');
    await purchases.configurePurchases('u2');
    expect(plugin.logIn).toHaveBeenCalledWith({ appUserID: 'u2' });
    expect(purchases.getPurchasesSnapshot().userId).toBe('u2');
  });
  it('null(ログアウト・ゲスト)で logOut。未設定のときは何も呼ばない', async () => {
    await purchases.configurePurchases(null);
    expect(plugin.logOut).not.toHaveBeenCalled();
    await purchases.configurePurchases('u1');
    await purchases.configurePurchases(null);
    expect(plugin.logOut).toHaveBeenCalledTimes(1);
    expect(purchases.getPurchasesSnapshot().userId).toBeNull();
    // ログアウト後に同じユーザーで戻ったら logIn
    await purchases.configurePurchases('u1');
    expect(plugin.logIn).toHaveBeenCalledWith({ appUserID: 'u1' });
  });
  it('configure の失敗は Result で返し、throw しない', async () => {
    plugin.configure.mockRejectedValueOnce(new Error('boom'));
    const r = await purchases.configurePurchases('u1');
    expect(r).toMatchObject({ ok: false, error: { messageKey: 'purchase/configure-failed' } });
    expect(purchases.getPurchasesSnapshot().userId).toBeNull();
    expect(purchases.getPurchasesSnapshot().status).toBe('error');
    await purchases.configurePurchases('u1');
    expect(purchases.getPurchasesSnapshot()).toMatchObject({ userId: 'u1', status: 'ready' });
  });
  it('設定中にログアウトしたら古い完了を公開しない', async () => {
    let complete!: () => void;
    plugin.configure.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const configuring = purchases.configurePurchases('u1');
    await Promise.resolve();
    const logout = purchases.configurePurchases(null);
    expect(purchases.getPurchasesSnapshot().userId).toBeNull();
    complete();
    expect((await configuring).ok).toBe(false);
    await logout;
    expect(plugin.logOut).toHaveBeenCalledTimes(1);
    expect(purchases.getPurchasesSnapshot()).toMatchObject({ userId: null, status: 'idle' });
  });
  it('ログイン切替に失敗しても旧ユーザーで購入しない', async () => {
    await purchases.configurePurchases('u1');
    plugin.logIn.mockRejectedValueOnce({ code: PURCHASES_ERROR_CODE.NETWORK_ERROR });
    await purchases.configurePurchases('u2');
    expect(purchases.getPurchasesSnapshot()).toMatchObject({
      userId: null,
      status: 'error',
      messageKey: 'purchase/offline',
    });
    expect((await purchases.purchasePlan('calendar_write')).ok).toBe(false);
    expect(plugin.purchasePackage).not.toHaveBeenCalled();
    await purchases.configurePurchases('u2');
    expect(purchases.getPurchasesSnapshot().userId).toBe('u2');
  });
  it('ログイン切替失敗の後に旧利用者へ戻る場合もSDKを紐付け直す', async () => {
    await purchases.configurePurchases('u1');
    plugin.logIn.mockRejectedValueOnce(new Error('切替失敗'));
    await purchases.configurePurchases('u2');
    await purchases.configurePurchases('u1');
    expect(plugin.logIn).toHaveBeenLastCalledWith({ appUserID: 'u1' });
    expect(purchases.getPurchasesSnapshot().userId).toBe('u1');
  });
});

describe('価格', () => {
  it('商品取得の途中で利用者が切り替わったら価格を捨てる', async () => {
    await purchases.configurePurchases('u1');
    let complete!: (value: typeof offerings) => void;
    plugin.getOfferings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const prices = purchases.getPlanPrices();
    await Promise.resolve();
    const change = purchases.configurePurchases('u2');
    complete(offerings);
    expect((await prices).ok).toBe(false);
    await change;
    expect(purchases.getPurchasesSnapshot().userId).toBe('u2');
  });
  it('商品IDに対応するパッケージのストア価格文字列を返す(Android の base plan 付き ID も対応)', async () => {
    await purchases.configurePurchases('u1');
    const r = await purchases.getPlanPrices();
    expect(r).toEqual({
      ok: true,
      value: { calendar_write: '¥300', multi_account: '¥1,000' },
    });
  });
  it('見つからない商品は含めない(仮表示のまま)', async () => {
    plugin.getOfferings.mockResolvedValue({
      current: { availablePackages: [pkg('calendar_write_monthly', '¥300')] },
      all: {},
    });
    await purchases.configurePurchases('u1');
    const r = await purchases.getPlanPrices();
    expect(r).toEqual({ ok: true, value: { calendar_write: '¥300' } });
  });
  it('取得失敗はエラー', async () => {
    plugin.getOfferings.mockRejectedValue(new Error('x'));
    await purchases.configurePurchases('u1');
    expect(await purchases.getPlanPrices()).toMatchObject({
      ok: false,
      error: { messageKey: 'purchase/offerings-failed' },
    });
  });
});

describe('購入', () => {
  it('取得済みパッケージとoffering contextをそのまま購入へ渡す', async () => {
    platform = 'ios';
    await purchases.configurePurchases('u1');
    await purchases.getPlanPrices();
    plugin.getOfferings.mockClear();
    await purchases.purchasePlan('calendar_write', 'u1');
    expect(plugin.getOfferings).not.toHaveBeenCalled();
    expect(plugin.purchasePackage.mock.calls[0]![0].aPackage).toBe(
      offerings.current.availablePackages[0],
    );
    expect(plugin.purchasePackage.mock.calls[0]![0].aPackage.presentedOfferingContext).toEqual(
      { offeringIdentifier: 'default', placementIdentifier: null, targetingContext: null },
    );
  });
  it('旧利用者を指定した購入と、購入前の旧契約取得中の切替を拒否する', async () => {
    await purchases.configurePurchases('u1');
    expect((await purchases.purchasePlan('calendar_write', 'u2')).ok).toBe(false);
    let complete!: (value: unknown) => void;
    plugin.getCustomerInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const purchase = purchases.purchasePlan('multi_account', 'u1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const change = purchases.configurePurchases('u2');
    complete({ customerInfo: { activeSubscriptions: [] } });
    expect((await purchase).ok).toBe(false);
    await change;
    expect(plugin.purchasePackage).not.toHaveBeenCalled();
  });
  it('診断ログに例外本文や個人情報を出さない', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await purchases.configurePurchases('u1');
      plugin.purchasePackage.mockRejectedValue({
        code: '秘密のコード',
        message: '秘密の本文',
        receipt: '秘密のレシート',
      });
      await purchases.purchasePlan('calendar_write');
      expect(log).toHaveBeenLastCalledWith('課金処理', {
        stage: 'store-purchase',
        code: 'unknown',
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/秘密|u1/);
    } finally {
      log.mockRestore();
    }
  });
  it('成功すると purchased。購入するのは該当商品のパッケージ', async () => {
    await purchases.configurePurchases('u1');
    const r = await purchases.purchasePlan('calendar_write');
    expect(r).toEqual({ ok: true, value: 'purchased' });
    expect(plugin.purchasePackage).toHaveBeenCalledWith({
      aPackage: expect.objectContaining({ identifier: '$rc_calendar_write_monthly' }),
    });
  });
  it('ユーザーのキャンセル(エラーコード)はエラーにしない', async () => {
    plugin.purchasePackage.mockRejectedValue({
      code: PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR,
      userCancelled: true,
    });
    await purchases.configurePurchases('u1');
    expect(await purchases.purchasePlan('calendar_write')).toEqual({
      ok: true,
      value: 'cancelled',
    });
  });
  it('それ以外のエラーは messageKey 化する', async () => {
    plugin.purchasePackage.mockRejectedValue({
      code: PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
    });
    await purchases.configurePurchases('u1');
    expect(await purchases.purchasePlan('calendar_write')).toMatchObject({
      ok: false,
      error: { messageKey: 'purchase/failed' },
    });
  });
  it('通信エラー・承認待ちは専用の messageKey', async () => {
    await purchases.configurePurchases('u1');
    plugin.purchasePackage.mockRejectedValueOnce({ code: PURCHASES_ERROR_CODE.NETWORK_ERROR });
    expect(await purchases.purchasePlan('calendar_write')).toMatchObject({
      error: { messageKey: 'purchase/offline' },
    });
    plugin.purchasePackage.mockRejectedValueOnce({
      code: PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR,
    });
    expect(await purchases.purchasePlan('calendar_write')).toMatchObject({
      error: { messageKey: 'purchase/pending' },
    });
  });
  it('商品が見つからなければ購入を呼ばずエラー', async () => {
    plugin.getOfferings.mockResolvedValue({ current: { availablePackages: [] }, all: {} });
    await purchases.configurePurchases('u1');
    expect(await purchases.purchasePlan('multi_account')).toMatchObject({
      error: { messageKey: 'purchase/product-missing' },
    });
    expect(plugin.purchasePackage).not.toHaveBeenCalled();
  });
  it('Android で予定反映の契約中に複数アカウントを買うと、旧商品IDを商品変更として渡す', async () => {
    plugin.getCustomerInfo.mockResolvedValue({
      customerInfo: {
        activeSubscriptions: ['calendar_write_monthly:base'],
        managementURL: null,
      },
    });
    await purchases.configurePurchases('u1');
    await purchases.purchasePlan('multi_account');
    expect(plugin.purchasePackage).toHaveBeenCalledWith({
      aPackage: expect.objectContaining({ identifier: '$rc_multi_account_monthly:base' }),
      storeProductChangeInfo: { oldProductIdentifier: 'calendar_write_monthly:base' },
    });
  });
  it('旧契約の確認に失敗したら二重契約を避けるため購入を中止する', async () => {
    plugin.getCustomerInfo.mockRejectedValue(new Error('通信失敗'));
    await purchases.configurePurchases('u1');
    expect((await purchases.purchasePlan('multi_account')).ok).toBe(false);
    expect(plugin.purchasePackage).not.toHaveBeenCalled();
  });
  it('iOS では商品変更情報を渡さない(同一グループのストア処理に任せる)', async () => {
    platform = 'ios';
    plugin.getCustomerInfo.mockResolvedValue({
      customerInfo: { activeSubscriptions: ['calendar_write_monthly'], managementURL: null },
    });
    await purchases.configurePurchases('u1');
    await purchases.purchasePlan('multi_account');
    expect(plugin.purchasePackage.mock.calls[0]![0]).not.toHaveProperty(
      'storeProductChangeInfo',
    );
  });
});

describe('復元・管理', () => {
  it('iOSでは別ストアの購読URLが返ってもApp Storeを開く', async () => {
    platform = 'ios';
    plugin.getCustomerInfo.mockResolvedValue({
      customerInfo: {
        activeSubscriptions: ['multi_account_monthly'],
        managementURL: 'https://play.google.com/store/account/subscriptions',
      },
    });
    await purchases.configurePurchases('u1');
    expect(await purchases.getManagementUrl()).toEqual({
      ok: true,
      value: 'https://apps.apple.com/account/subscriptions',
    });
  });
  it('復元: 有効な購読があるかを返す', async () => {
    await purchases.configurePurchases('u1');
    expect(await purchases.restorePurchases()).toEqual({
      ok: true,
      value: { hasActiveSubscription: false },
    });
    plugin.restorePurchases.mockResolvedValue({
      customerInfo: { activeSubscriptions: ['multi_account_monthly'] },
    });
    expect(await purchases.restorePurchases()).toEqual({
      ok: true,
      value: { hasActiveSubscription: true },
    });
  });
  it('復元の失敗は messageKey', async () => {
    plugin.restorePurchases.mockRejectedValue(new Error('x'));
    await purchases.configurePurchases('u1');
    expect(await purchases.restorePurchases()).toMatchObject({
      error: { messageKey: 'purchase/restore-failed' },
    });
  });
  it('管理URL: customerInfo.managementURL を返す(無ければ null)', async () => {
    await purchases.configurePurchases('u1');
    expect(await purchases.getManagementUrl()).toEqual({ ok: true, value: null });
    plugin.getCustomerInfo.mockResolvedValue({
      customerInfo: { activeSubscriptions: [], managementURL: 'https://store.example/manage' },
    });
    expect(await purchases.getManagementUrl()).toEqual({
      ok: true,
      value: 'https://store.example/manage',
    });
  });
});
