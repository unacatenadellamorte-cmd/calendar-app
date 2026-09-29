import {
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
  BannerAdPluginEvents,
  AdmobConsentDebugGeography,
  type AdMobPlugin,
  type AdmobConsentInfo,
  type BannerAdOptions,
} from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AdsConfig } from '../../scripts/admob-config';

export interface AdsState {
  privacyRequired: boolean;
  busy: boolean;
  error: boolean;
  height: number;
}
export interface BannerPlacement { margin: number; left: number; width: number; height: number; visible: boolean }
export interface PositionedAdMob extends AdMobPlugin {
  showBanner(options: BannerAdOptions & { width: number; left: number; requestId: number }): Promise<void>;
  updateBannerPlacement(options: { margin: number; left: number; visible: boolean; requestId: number }): Promise<void>;
}

/** SDK操作を直列化する。位置の更新では広告リクエストを発生させない。 */
export function createAdsController(sdk: PositionedAdMob, config: AdsConfig, changed: (state: AdsState) => void) {
  let state: AdsState = { privacyRequired: false, busy: false, error: false, height: 0 };
  let target: BannerPlacement | null = null;
  let shown: { width: number; requestId: number } | null = null;
  let removalPending = false;
  let applied = '';
  let requestId = 0;
  let generation = 0;
  let ready = false;
  let initialized = false;
  let consent: AdmobConsentInfo | null = null;
  let queue = Promise.resolve();
  let listeners: PluginListenerHandle[] = [];
  let starting: Promise<void> | null = null;
  let inspecting: Promise<void> | null = null;
  let consentFormDeferred = false;
  const publish = (patch: Partial<AdsState>) => { state = { ...state, ...patch }; changed(state); };
  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch(async () => {
      // 配置更新の失敗時も古い位置に広告を残さない。
      await remove().catch(() => undefined);
      publish({ error: true, busy: false, height: 0 });
    });
    return queue;
  };
  const updateConsent = (info: AdmobConsentInfo) => {
    consent = info;
    publish({ privacyRequired: info.privacyOptionsRequirementStatus === 'REQUIRED' });
  };
  const remove = async () => {
    const existed = shown;
    applied = '';
    publish({ height: 0 });
    if (existed) {
      // 失敗してもハンドルを保持し、次の操作で破棄を再試行する。
      removalPending = true;
      await sdk.removeBanner();
      if (shown === existed) shown = null;
    }
    removalPending = false;
  };
  const position = async () => {
    if (!shown) return;
    const next = target;
    const options = {
      requestId: shown.requestId,
      margin: next?.margin ?? 0,
      left: next?.left ?? 0,
      // SDKのロード完了だけでは見せず、DOMに専用の高さが確保されるのを待つ。
      visible: Boolean(next?.visible && next.width === shown.width && state.height > 0 && next.height >= state.height && !state.busy),
    };
    const key = JSON.stringify(options);
    if (key === applied) return;
    await sdk.updateBannerPlacement(options);
    applied = key;
  };
  const reconcile = async () => {
    if (removalPending) await remove();
    if (!ready || !consent?.canRequestAds || !target || state.busy) { await remove(); return; }
    if (shown && shown.width !== target.width) await remove();
    // removeの待機中も最新の画面状態を読み直す。
    if (!target || state.busy) return;
    if (shown) { await position(); return; }
    if (state.error || !target.visible || target.width <= 0) return;
    const current = { width: target.width, requestId: ++requestId };
    const epoch = generation;
    shown = current;
    try {
      await sdk.showBanner({
        adId: config.bannerId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.TOP_CENTER,
        margin: target.margin,
        left: target.left,
        width: target.width,
        requestId: current.requestId,
        // パーソナライズ可否はUMPの保存した同意信号をSDKが解釈する。
      });
      if (generation !== epoch || !target || target.width !== current.width) await remove();
      else await position();
    } catch {
      await remove();
      publish({ error: true });
    }
  };
  const requestConsent = async (epoch: number, allowForm = true) => {
    let info = await sdk.requestConsentInfo(config.mode === 'test' && config.debugEea ? {
      debugGeography: AdmobConsentDebugGeography.EEA,
      testDeviceIdentifiers: config.testDeviceIds,
    } : undefined);
    if (epoch !== generation) return;
    consentFormDeferred = info.status === AdmobConsentStatus.REQUIRED && Boolean(info.isConsentFormAvailable);
    if (consentFormDeferred && allowForm && target?.visible) {
      info = await sdk.showConsentForm();
      if (epoch !== generation) return;
      consentFormDeferred = false;
    }
    if (epoch === generation) updateConsent(info);
  };
  return {
    inspectConsent() {
      // 設定への直行でも確認する。広告SDKの初期化やフォーム表示は行わない。
      if (consent || starting) return starting ?? queue;
      if (inspecting) return inspecting;
      const epoch = generation;
      const run = enqueue(() => requestConsent(epoch, false)).finally(() => {
        if (inspecting === run) inspecting = null;
      });
      inspecting = run;
      return run;
    },
    start(retry = false) {
      if (retry) publish({ error: false });
      if (starting) return starting;
      if (!retry && ready && consent && !consentFormDeferred) return enqueue(reconcile);
      if (state.error || (!retry && consent && !consent.canRequestAds && !consentFormDeferred)) return queue;
      const epoch = generation;
      const run = enqueue(async () => {
        if (!target || epoch !== generation) return;
        if (!listeners.length) {
          const pending: PluginListenerHandle[] = [];
          try {
            pending.push(await sdk.addListener(BannerAdPluginEvents.SizeChanged, (info) => {
              const event = info as typeof info & { requestId: number };
              if (epoch !== generation || removalPending || !target || !shown || event.requestId !== shown.requestId || target.width !== shown.width) return;
              if (Number.isFinite(event.height) && event.height > 0) publish({ height: event.height });
            }));
            pending.push(await sdk.addListener(BannerAdPluginEvents.FailedToLoad, (info) => {
              if (epoch !== generation || !shown || (info as typeof info & { requestId: number }).requestId !== shown.requestId) return;
              shown = null;
              removalPending = false;
              applied = '';
              publish({ height: 0, error: true });
            }));
            listeners = pending;
          } catch (error) {
            // 部分登録を残すと、次回の開始で不足イベントを購読できなくなる。
            await Promise.allSettled(pending.map((handle) => handle.remove()));
            throw error;
          }
        }
        await requestConsent(epoch);
        if (epoch !== generation || !target) return;
        if ((consent as AdmobConsentInfo | null)?.canRequestAds && !initialized) {
          await sdk.initialize();
          initialized = true;
        }
        if (epoch !== generation) return;
        ready = initialized;
        await reconcile();
      }).finally(() => { if (starting === run) starting = null; });
      starting = run;
      return run;
    },
    place(next: BannerPlacement | null, retry = false) {
      if (retry || (target && next && target.width !== next.width)) publish({ error: false });
      target = next;
      if (!next) publish({ height: 0 });
      return enqueue(reconcile);
    },
    privacy() {
      if (state.busy) return queue;
      publish({ busy: true, error: false });
      const epoch = generation;
      return enqueue(async () => {
        await remove();
        try {
          consent = null;
          await sdk.showPrivacyOptionsForm();
          await requestConsent(epoch);
          if (epoch !== generation) return;
          if ((consent as AdmobConsentInfo | null)?.canRequestAds && !initialized) {
            await sdk.initialize();
            initialized = true;
          }
          ready = initialized;
        } finally {
          publish({ busy: false });
        }
        await reconcile();
      });
    },
    stop() {
      generation++;
      target = null;
      ready = false;
      consent = null;
      consentFormDeferred = false;
      inspecting = null;
      starting = null;
      publish({ height: 0, error: false });
      return enqueue(async () => {
        try {
          await remove();
        } finally {
          // 広告破棄の成否と購読解除を分離し、再マウントに古い世代を残さない。
          ready = false;
          consent = null;
          const previousListeners = listeners;
          listeners = [];
          await Promise.allSettled(previousListeners.map((handle) => handle.remove()));
        }
      });
    },
    settled: () => queue,
  };
}
