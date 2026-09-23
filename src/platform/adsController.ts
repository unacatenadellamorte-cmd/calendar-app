import {
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
  BannerAdPluginEvents,
  AdmobConsentDebugGeography,
  type AdMobPlugin,
  type AdmobConsentInfo,
} from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AdsConfig } from '../../scripts/admob-config';

export interface AdsState {
  privacyRequired: boolean;
  busy: boolean;
  error: boolean;
  height: number;
}
export interface BannerPlacement { margin: number; width: number }

/** ネイティブ呼び出しを直列化し、画面破棄・同意変更中の遅い完了を無効にする。 */
export function createAdsController(sdk: AdMobPlugin, config: AdsConfig, changed: (state: AdsState) => void) {
  let state: AdsState = { privacyRequired: false, busy: false, error: false, height: 0 };
  let target: BannerPlacement | null = null;
  let shown: BannerPlacement | null = null;
  let ready = false;
  let initialized = false;
  let consent: AdmobConsentInfo | null = null;
  let queue = Promise.resolve();
  let listeners: PluginListenerHandle[] = [];
  let starting: Promise<void> | null = null;
  const publish = (patch: Partial<AdsState>) => { state = { ...state, ...patch }; changed(state); };
  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch(() => { publish({ error: true, busy: false, height: 0 }); });
    return queue;
  };
  const updateConsent = (info: AdmobConsentInfo) => {
    consent = info;
    publish({ privacyRequired: info.privacyOptionsRequirementStatus === 'REQUIRED' });
  };
  const remove = async () => {
    if (shown) await sdk.removeBanner();
    shown = null;
    publish({ height: 0 });
  };
  const reconcile = async () => {
    const next = target;
    if (!ready || !consent?.canRequestAds || !next || state.busy) { await remove(); return; }
    if (shown?.margin === next.margin && shown.width === next.width) return;
    await remove();
    // removeの待機中に画面が変わった場合も、古い配置ではリクエストしない。
    if (target !== next) return;
    shown = next;
    try {
      await sdk.showBanner({
        adId: config.bannerId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: next.margin,
        // パーソナライズ可否はUMPの保存した同意信号をGoogle SDKが解釈する。
        // canRequestAds=falseをnpaで迂回しない。
      });
      if (target !== next) await remove();
    } catch {
      await remove();
      publish({ error: true });
    }
  };
  const requestConsent = async () => {
    const info = await sdk.requestConsentInfo(config.mode === 'test' && config.debugEea ? {
      debugGeography: AdmobConsentDebugGeography.EEA,
      testDeviceIdentifiers: config.testDeviceIds,
    } : undefined);
    updateConsent(info);
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable && target) {
      updateConsent(await sdk.showConsentForm());
    }
  };
  return {
    start() {
      if (ready && consent) return enqueue(reconcile);
      if (starting) return starting;
      const run = enqueue(async () => {
        if (!target) return;
        if (!listeners.length) {
          listeners.push(await sdk.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
            publish({ height: target && shown && Number.isFinite(height) ? Math.max(0, height) : 0 });
          }));
          listeners.push(await sdk.addListener(BannerAdPluginEvents.FailedToLoad, () => {
            shown = null;
            publish({ height: 0, error: true });
          }));
        }
        publish({ error: false });
        // UMPはinitializeなしで利用可能。広告SDK初期化も同意確認後に行う。
        await requestConsent();
        if ((consent as AdmobConsentInfo | null)?.canRequestAds && target && !initialized) {
          await sdk.initialize();
          initialized = true;
        }
        ready = initialized;
        await reconcile();
      }).finally(() => { if (starting === run) starting = null; });
      starting = run;
      return run;
    },
    place(next: BannerPlacement | null) {
      target = next;
      if (!next) publish({ height: 0 });
      return enqueue(reconcile);
    },
    privacy() {
      if (state.busy) return queue;
      publish({ busy: true, error: false });
      return enqueue(async () => {
        await remove();
        try {
          // 失敗時も旧同意で広告を再開しない。
          consent = null;
          await sdk.showPrivacyOptionsForm();
          await requestConsent();
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
      target = null;
      ready = false;
      consent = null;
      // 再マウントは停止処理の後ろへ新しい開始を並べる。
      starting = null;
      publish({ height: 0 });
      return enqueue(async () => {
        await remove();
        ready = false;
        consent = null;
        for (const handle of listeners) await handle.remove();
        listeners = [];
      });
    },
    settled: () => queue,
  };
}
