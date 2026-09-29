import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { useEffect, useSyncExternalStore } from 'react';
import { createAdsController, type AdsState, type BannerPlacement, type PositionedAdMob } from './adsController';

export const adsSupported = () => {
  const platform = Capacitor.getPlatform();
  return (platform === 'android' || platform === 'ios') && platform === __ADMOB_CONFIG__.platform;
};
export const privacyPolicyUrl = __ADMOB_CONFIG__.privacyUrl;
let state: AdsState = { privacyRequired: false, busy: false, error: false, height: 0 };
const listeners = new Set<() => void>();
// 両OSの8.1.0局所パッチで位置だけを更新するメソッドを追加している。
const controller = createAdsController(AdMob as PositionedAdMob, __ADMOB_CONFIG__, (next) => {
  state = next;
  listeners.forEach((listener) => listener());
});
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function useAdsState() {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (adsSupported()) void controller.inspectConsent();
  }, []);
  return snapshot;
}
export const showAdsPrivacy = () => adsSupported() ? controller.privacy() : Promise.resolve();
export function placeBanner(placement: BannerPlacement, retry = false): void {
  if (!adsSupported()) return;
  void controller.place(placement, retry);
  if (placement.visible) void controller.start(retry);
}
export const stopBanner = () => { if (adsSupported()) void controller.stop(); };
