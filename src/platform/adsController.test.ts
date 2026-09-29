import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdmobConsentStatus,
  BannerAdPluginEvents,
  type AdmobConsentInfo,
} from '@capacitor-community/admob';
import { createAdsController, type AdsState, type BannerPlacement, type PositionedAdMob } from './adsController';

const config = {
  platform: 'android' as const,
  mode: 'test' as const,
  appId: 'ca-app-pub-3940256099942544~3347511713',
  bannerId: 'ca-app-pub-3940256099942544/9214589741',
  privacyUrl: '',
  debugEea: false,
  testDeviceIds: [],
};
const placement: BannerPlacement = { margin: 112, left: 8, width: 320, height: 0, visible: true };

function consent(canRequestAds: boolean): AdmobConsentInfo {
  return {
    status: canRequestAds ? AdmobConsentStatus.NOT_REQUIRED : AdmobConsentStatus.REQUIRED,
    isConsentFormAvailable: false,
    canRequestAds,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED' as AdmobConsentInfo['privacyOptionsRequirementStatus'],
  };
}

function setup() {
  const sizeListeners = new Map<string, (info: { height: number; requestId: number }) => void>();
  const failedListeners = new Map<string, (info: { requestId: number }) => void>();
  const states: AdsState[] = [];
  const sdk = {
    requestConsentInfo: vi.fn().mockResolvedValue(consent(true)),
    showConsentForm: vi.fn().mockResolvedValue(consent(true)),
    showPrivacyOptionsForm: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    showBanner: vi.fn().mockResolvedValue(undefined),
    updateBannerPlacement: vi.fn().mockResolvedValue(undefined),
    removeBanner: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(async (event: string, listener: (info: { height: number; requestId: number }) => void) => {
      if (event === BannerAdPluginEvents.SizeChanged) sizeListeners.set(event, listener);
      if (event === BannerAdPluginEvents.FailedToLoad) failedListeners.set(event, listener as (info: { requestId: number }) => void);
      return { remove: vi.fn().mockResolvedValue(undefined) };
    }),
  };
  const controller = createAdsController(
    sdk as unknown as PositionedAdMob,
    config,
    (state) => states.push(state),
  );
  return { sdk, controller, states, sizeListeners, failedListeners };
}

describe('createAdsController', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('広告枠なしでプライバシー要否だけ確認し、フォームやSDKは起動しない', async () => {
    const { sdk, controller, states } = setup();
    sdk.requestConsentInfo.mockResolvedValue({ ...consent(false), isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED' as AdmobConsentInfo['privacyOptionsRequirementStatus'] });
    await Promise.all([controller.inspectConsent(), controller.inspectConsent()]);
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.privacyRequired).toBe(true);
    expect(sdk.showConsentForm).not.toHaveBeenCalled();
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
    await controller.place(placement);
    await controller.start();
    expect(sdk.showConsentForm).toHaveBeenCalledTimes(1);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

  it('SDK初期化済みでも明示再試行は同意を再取得し、再許可後に復帰する', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement); await controller.start();
    sdk.requestConsentInfo.mockResolvedValue(consent(false));
    await controller.start(true);
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(2);
    expect(sdk.removeBanner).toHaveBeenCalledTimes(1);
    sdk.requestConsentInfo.mockResolvedValue(consent(true));
    await controller.start(true);
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(3);
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    expect(sdk.showBanner).toHaveBeenCalledTimes(2);
  });

  it('明示再試行で同意が変わらなければ表示中の広告を取り直さない', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement); await controller.start();
    await controller.start(true);
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(2);
    expect(sdk.removeBanner).not.toHaveBeenCalled();
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

  it('削除失敗時は旧広告を保持し、破棄成功後だけ新しい幅で要求する', async () => {
    const { sdk, controller, sizeListeners, states } = setup();
    await controller.place(placement); await controller.start();
    sdk.removeBanner.mockRejectedValue(new Error('削除失敗'));
    await controller.place({ ...placement, width: 600 });
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 1 });
    expect(states.at(-1)?.height).toBe(0);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
    sdk.removeBanner.mockResolvedValue(undefined);
    await controller.start(true);
    expect(sdk.showBanner).toHaveBeenCalledTimes(2);
    expect(sdk.showBanner.mock.invocationCallOrder.at(-1)).toBeGreaterThan(sdk.removeBanner.mock.invocationCallOrder.at(-1)!);
  });

  it('離脱時の削除失敗でも購読を解除し、再マウントでは新しい購読で復帰する', async () => {
    const { sdk, controller, sizeListeners, states } = setup();
    await controller.place(placement); await controller.start();
    sdk.removeBanner.mockRejectedValue(new Error('削除失敗'));
    await controller.stop();
    for (const handle of sdk.addListener.mock.results) expect((await handle.value).remove).toHaveBeenCalledTimes(1);
    sdk.removeBanner.mockResolvedValue(undefined);
    await controller.place(placement, true); await controller.start(true);
    expect(sdk.addListener).toHaveBeenCalledTimes(4);
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 2 });
    expect(states.at(-1)?.height).toBe(60);
  });

  it('同意応答までに入力画面で隠れたらフォームを延期し、可視に戻ると再開する', async () => {
    const { sdk, controller } = setup();
    let complete!: (info: AdmobConsentInfo) => void;
    sdk.requestConsentInfo.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const required = { ...consent(false), isConsentFormAvailable: true };
    sdk.requestConsentInfo.mockResolvedValue(required);
    await controller.place(placement);
    const started = controller.start();
    await vi.waitFor(() => expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1));
    const hidden = controller.place({ ...placement, visible: false });
    complete(required);
    await Promise.all([started, hidden]);
    expect(sdk.showConsentForm).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
    await controller.place(placement); await controller.start();
    expect(sdk.showConsentForm).toHaveBeenCalledTimes(1);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

  it('リスナーの部分登録を解除し、次の再試行で両イベントを購読する', async () => {
    const { sdk, controller, failedListeners, states } = setup();
    const partial = { remove: vi.fn().mockResolvedValue(undefined) };
    sdk.addListener.mockResolvedValueOnce(partial).mockRejectedValueOnce(new Error('購読失敗'));
    await controller.place(placement); await controller.start();
    expect(partial.remove).toHaveBeenCalledTimes(1);
    expect(sdk.requestConsentInfo).not.toHaveBeenCalled();
    await controller.start(true);
    expect(sdk.addListener).toHaveBeenCalledTimes(4);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
    failedListeners.get(BannerAdPluginEvents.FailedToLoad)?.({ requestId: 1 });
    expect(states.at(-1)?.error).toBe(true);
  });

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
    failedListeners.get(BannerAdPluginEvents.FailedToLoad)?.({ requestId: 1 });
    await controller.settled();

    expect(states.at(-1)).toMatchObject({ error: true, height: 0 });
  });

  it('サイズ変更イベントの高さを反映する', async () => {
    const { controller, sizeListeners, states } = setup();
    await controller.place(placement);
    await controller.start();
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 52, requestId: 1 });

    expect(states.at(-1)).toMatchObject({ height: 52 });
  });

  it('配置変更時は旧バナーを削除して新しい配置で再表示する', async () => {
    const { sdk, controller } = setup();
    await controller.place(placement);
    await controller.start();
    await controller.place({ ...placement, margin: 24, width: 400 });

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
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
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
  it('高さを確保する前は隠し、スクロールとモーダルの開閉では取り直さない', async () => {
    const { sdk, controller, sizeListeners, states } = setup();
    await controller.place(placement); await controller.start();
    expect(sdk.showBanner).toHaveBeenLastCalledWith(expect.objectContaining({ position: 'TOP_CENTER', width: 320 }));
    expect(sdk.updateBannerPlacement).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 1 });
    await controller.place({ ...placement, height: 60 });
    expect(sdk.updateBannerPlacement).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    await controller.place({ ...placement, height: 60, margin: 20 });
    expect(sdk.updateBannerPlacement).toHaveBeenLastCalledWith(expect.objectContaining({ margin: 20, visible: true }));
    await controller.place({ ...placement, height: 60, visible: false });
    expect(sdk.updateBannerPlacement).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
    expect(states.at(-1)?.height).toBe(60);
    await controller.place({ ...placement, height: 60 });
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
    expect(sdk.removeBanner).not.toHaveBeenCalled();
  });

  it('幅変更は削除完了を待ち、旧サイズイベントを捨てる', async () => {
    const { sdk, controller, sizeListeners, states } = setup();
    await controller.place(placement); await controller.start();
    let finishRemove!: () => void;
    sdk.removeBanner.mockReturnValueOnce(new Promise<void>((resolve) => { finishRemove = resolve; }));
    const change = controller.place({ ...placement, width: 600 });
    await vi.waitFor(() => expect(sdk.removeBanner).toHaveBeenCalledTimes(1));
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 1 });
    expect(states.at(-1)?.height).toBe(0);
    finishRemove(); await change;
    expect(sdk.showBanner).toHaveBeenLastCalledWith(expect.objectContaining({ width: 600, requestId: 2 }));
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 1 });
    expect(states.at(-1)?.height).toBe(0);
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 90, requestId: 2 });
    expect(states.at(-1)?.height).toBe(90);
  });

  it('遅いshowBannerの完了時は最新位置にだけ配置する', async () => {
    const { sdk, controller, sizeListeners } = setup();
    let finishShow!: () => void;
    sdk.showBanner.mockReturnValueOnce(new Promise<void>((resolve) => { finishShow = resolve; }));
    await controller.place(placement);
    const started = controller.start();
    await vi.waitFor(() => expect(sdk.showBanner).toHaveBeenCalledTimes(1));
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 1 });
    const moved = controller.place({ ...placement, margin: 180, height: 60 });
    finishShow(); await Promise.all([started, moved]);
    expect(sdk.updateBannerPlacement).toHaveBeenCalledTimes(1);
    expect(sdk.updateBannerPlacement).toHaveBeenLastCalledWith(expect.objectContaining({ margin: 180, visible: true }));
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

  it('表示処理中に離脱したら、遅い応答で表示せず破棄してlistenerを解除する', async () => {
    const { sdk, controller, sizeListeners, states } = setup();
    let finishShow!: () => void;
    sdk.showBanner.mockReturnValueOnce(new Promise<void>((resolve) => { finishShow = resolve; }));
    await controller.place(placement);
    const started = controller.start();
    await vi.waitFor(() => expect(sdk.showBanner).toHaveBeenCalledTimes(1));
    const stopped = controller.stop();
    sizeListeners.get(BannerAdPluginEvents.SizeChanged)?.({ height: 60, requestId: 1 });
    finishShow(); await Promise.all([started, stopped]);
    expect(sdk.updateBannerPlacement).not.toHaveBeenCalled();
    expect(sdk.removeBanner).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.height).toBe(0);
    for (const handle of sdk.addListener.mock.results) expect((await handle.value).remove).toHaveBeenCalledTimes(1);
  });

  it('no fill後のスクロールでは再要求せず、復帰の明示再試行で回復する', async () => {
    const { sdk, controller, failedListeners } = setup();
    await controller.place(placement); await controller.start();
    failedListeners.get(BannerAdPluginEvents.FailedToLoad)?.({ requestId: 1 });
    await controller.place({ ...placement, margin: 50 }); await controller.start();
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
    await controller.place(placement, true); await controller.start(true);
    expect(sdk.showBanner).toHaveBeenCalledTimes(2);
  });

  it('同意不可の間はスクロールごとに同意要求を繰り返さない', async () => {
    const { sdk, controller } = setup();
    sdk.requestConsentInfo.mockResolvedValue(consent(false));
    await controller.place(placement); await controller.start();
    await controller.place({ ...placement, margin: 50 }); await controller.start();
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1);
    sdk.requestConsentInfo.mockResolvedValue(consent(true));
    await controller.start(true);
    expect(sdk.showBanner).toHaveBeenCalledTimes(1);
  });

});
