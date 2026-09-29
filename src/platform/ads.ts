import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { useSyncExternalStore } from 'react';
import { createAdsController, type AdsState } from './adsController';

export const adsSupported = () => Capacitor.getPlatform() === 'android';
export const privacyPolicyUrl = __ADMOB_CONFIG__.privacyUrl;
let state: AdsState = { privacyRequired: false, busy: false, error: false, height: 0 };
const listeners = new Set<() => void>();
const controller = createAdsController(AdMob, __ADMOB_CONFIG__, (next) => {
  state = next;
  document.documentElement.style.setProperty('--ad-banner-height', `${next.height}px`);
  listeners.forEach((listener) => listener());
});
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useAdsState = () => useSyncExternalStore(subscribe, () => state);
export const showAdsPrivacy = () => adsSupported() ? controller.privacy() : Promise.resolve();
export function placeBanner(margin: number, width: number, blocked: boolean): void {
  if (!adsSupported()) return;
  void controller.place(blocked ? null : { margin, width });
  if (!blocked) void controller.start();
}
export const stopBanner = () => { if (adsSupported()) void controller.stop(); };
