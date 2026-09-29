import { useEffect } from 'react';
import { adsSupported, placeBanner, stopBanner } from '@/platform/ads';
import { onAppResume } from '@/platform/appLifecycle';

/** 下タブが存在する間だけ広告を管理する。シークレット状態には依存しない。 */
export function AdBanner() {
  useEffect(() => {
    if (!adsSupported()) return;
    const tabs = document.querySelector<HTMLElement>('.app-bottom-tabs');
    if (!tabs) return;
    let previous = '';
    const setHeight = (height: number) => {
      document.documentElement.style.setProperty('--ad-banner-height', `${height}px`);
    };
    const update = () => {
      const rect = tabs.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(tabs).paddingBottom) || 0;
      // SDK側でOS下端の安全領域を加えるため、ここではタブ本体の高さだけ渡す。
      const margin = Math.max(0, Math.ceil(rect.height - padding));
      const blocked = Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]')) ||
        (window.visualViewport ? window.visualViewport.height < window.innerHeight - 100 : false);
      const key = `${margin}:${window.innerWidth}:${blocked}`;
      if (key === previous) return;
      previous = key;
      placeBanner(margin, window.innerWidth, blocked);
    };
    const retry = () => { previous = ''; update(); };
    const observer = new ResizeObserver(update);
    observer.observe(tabs);
    const layers = new MutationObserver(update);
    layers.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('online', retry);
    const removeResume = onAppResume(retry);
    update();
    return () => {
      observer.disconnect();
      layers.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('online', retry);
      removeResume();
      stopBanner();
      setHeight(0);
    };
  }, []);
  return null;
}
