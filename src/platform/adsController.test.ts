import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdmobConsentStatus,
  BannerAdPluginEvents,
  type AdmobConsentInfo,
  type AdMobPlugin,
} from '@capacitor-community/admob';
import { createAdsController, type AdsState, type BannerPlacement } from './adsController';

const config = {
  mode: 'test' as const,
  appId: 'ca-app-pub-3940256099942544~3347511713',
  bannerId: 'ca-app-pub-3940256099942544/9214589741',
  privacyUrl: '',
  debugEea: false,
  testDeviceIds: [],
};
const placement: BannerPlacement = { margin: 12, width: 320 };

function consent(canRequestAds: boolean): AdmobConsentInfo {
  return {
    status: canRequestAds ? AdmobConsentStatus.NOT_REQUIRED : AdmobConsentStatus.REQUIRED,
    isConsentFormAvailable: false,
    canRequestAds,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED' as AdmobConsentInfo['privacyOptionsRequirementStatus'],
  };
}

function setup() {
  const sizeListeners = new Map<string, (info: { height: number }) => void>();
  const failedListeners = new Map<string, () => void>();
  const states: AdsState[] = [];
  const sdk = {
    requestConsentInfo: vi.fn().mockResolvedValue(consent(true)),
    showConsentForm: vi.fn().mockResolvedValue(consent(true)),
    showPrivacyOptionsForm: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    showBanner: vi.fn().mockResolvedValue(undefined),
    removeBanner: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(async (event: string, listener: (info: { height: number }) => void) => {
      if (event === BannerAdPluginEvents.SizeChanged) sizeListeners.set(event, listener);
      if (event === BannerAdPluginEvents.FailedToLoad) failedListeners.set(event, listener as () => void);
      return { remove: vi.fn().mockResolvedValue(undefined) };
    }),
  };
  const controller = createAdsController(
    sdk as unknown as AdMobPlugin,
    config,
    (state) => states.push(state),
  );
  return { sdk, controller, states, sizeListeners, failedListeners };
}

describe('createAdsController', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('canRequestAds=false では初期化も配信もしない', async () => {
    const { sdk, controller } = setup();
    sdk.requestConsentInfo.mockResolvedValue(consent(false));

    await controller.place(placement);
    await controller.start();

    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
  });

  it('同意フォーム後に canRequestAds=true なら初期化して配信する', async () => {
    const { sdk, controller } = setup();
    sdk.requestConsentInfo.mockResolvedValue({
      ...consent(false),
      status: AdmobConsentStatus.REQUIRED,
      isConsentFormAvailable: true,
    });
    sdk.showConsentForm.mockResolvedValue(consent(true));

    await controller.place(placement);
    await controller.start();

    expect(sdk.showConsentForm).toHaveBeenCalledTimes(1);
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

  it('同意通信が失敗したときは広告を表示しない', async () => {
    const { sdk, controller, states } = setup();
    sdk.requestConsentInfo.mockRejectedValue(new Error('network'));

    await controller.place(placement);
    await controller.start();

    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ error: true, height: 0, busy: false });
  });

  it('同意確認が遅い間に stop されたら、完了後も広告を表示しない', async () => {
    const { sdk, controller } = setup();
    let resolveConsent!: (info: AdmobConsentInfo) => void;
    sdk.requestConsentInfo.mockImplementation(
      () => new Promise<AdmobConsentInfo>((resolve) => { resolveConsent = resolve; }),
    );

    await controller.place(placement);
    const starting = controller.start();
    // 同意要求が開始したところで stop を割り込ませる。
    while (!resolveConsent) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const stopping = controller.stop();
    resolveConsent(consent(true));
    await starting;
    await stopping;

    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
  });

  it('place(null) で表示中バナーを削除する', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement);
    await controller.start();
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);

    await controller.place(null);

    expect(sdk.removeBanner).toHaveBeenCalled();
  });

  it('privacy 変更後に canRequestAds=false なら再配信しない', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement);
    await controller.start();
    sdk.requestConsentInfo.mockResolvedValue(consent(false));

    await controller.privacy();

    expect(sdk.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

  it('読み込み失敗時は高さを0に戻してエラーにする', async () => {
    const { controller, failedListeners, states } = setup();
    await controller.place(placement);
    await controller.start();
    failedListeners.get(BannerAdPluginEvents.FailedToLoad)?.();
    await controller.settled();

    expect(states.at(-1)).toMatchObject({ error: true, height: 0 });
  });

  it('サイズ変更イベントの高さを反映する', async () => {
    const { controller, sizeListeners, states } = setup();
    await controller.place(placement);
    await controller.start();
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 52 });

    expect(states.at(-1)).toMatchObject({ height: 52 });
  });

  it('配置変更時は旧バナーを削除して新しい配置で再表示する', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement);
    await controller.start();
    await controller.place({ margin: 24, width: 400 });

    expect(sdk.removeBanner).toHaveBeenCalled();
    expect(sdk.showBanner).toHaveBeenLastCalledWith(expect.objectContaining({ margin: 24 }));
  });

  it('start を二重に呼んでも同意確認は1回だけ行う', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement);
    await Promise.all([controller.start(), controller.start()]);

    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1);
  });
  it('開始中に停止して再マウントしても新しい画面で広告が復帰する', async () => {
    const { sdk, controller } = setup();
    let resolve!: (value: AdmobConsentInfo) => void;
    sdk.requestConsentInfo.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await controller.place(placement);
    const first = controller.start();
    await vi.waitFor(() => expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1));
    const stopped = controller.stop();
    const placed = controller.place(placement);
    const restarted = controller.start();
    resolve(consent(true));
    await Promise.all([first, stopped, placed, restarted]);
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(2);
    expect(sdk.showBanner.mock.invocationCallOrder.at(-1)).toBeGreaterThan(sdk.removeBanner.mock.invocationCallOrder.at(-1)!);
  });
  it('表示済み画面の即時停止と再開でも再表示する', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement); await controller.start();
    const stopped = controller.stop();
    const placed = controller.place(placement);
    const started = controller.start();
    await Promise.all([stopped, placed, started]);
    expect(sdk.showBanner).toHaveBeenCalledTimes(2);
  });
});
