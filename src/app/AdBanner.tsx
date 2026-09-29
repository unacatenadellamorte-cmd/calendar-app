import { useLayoutEffect, useRef } from 'react';
import { adsSupported, placeBanner, stopBanner, useAdsState } from '@/platform/ads';
import { onAppResume } from '@/platform/appLifecycle';

const bannerGap = 8;

/** DOMの専用枠とネイティブ広告を同じ座標・高さに揃える。 */
export function AdBanner() {
  const slot = useRef<HTMLDivElement>(null);
  const updateRef = useRef<() => void>(() => undefined);
  const { height } = useAdsState();
  const supported = adsSupported();
  useLayoutEffect(() => {
    const element = slot.current;
    if (!supported || !element) return;
    let previous = '';
    const update = (retry = false) => {
      const rect = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const keyboard = viewport ? viewport.height < window.innerHeight - 100 : false;
      // 拡大中のCSS座標はネイティブ座標と一致しないため、等倍へ戻るまで隠す。
      const zoomed = (viewport?.scale ?? 1) !== 1;
      // WebViewごと縮むキーボードでも、入力欄のフォーカス中は広告を隠す。
      const editing = document.activeElement instanceof HTMLElement &&
        document.activeElement.matches('input, textarea, select, [contenteditable="true"]');
      const tabsTop = document.querySelector('.app-bottom-tabs')?.getBoundingClientRect().top ?? window.innerHeight;
      const main = element.closest('main')?.getBoundingClientRect();
      const clipTop = Math.max(0, main?.top ?? 0, viewport?.offsetTop ?? 0);
      const clipBottom = Math.min(tabsTop, main?.bottom ?? window.innerHeight, (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0));
      const clipLeft = Math.max(0, main?.left ?? 0, viewport?.offsetLeft ?? 0);
      const clipRight = Math.min(main?.right ?? window.innerWidth, (viewport?.width ?? window.innerWidth) + (viewport?.offsetLeft ?? 0));
      const blocked = Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]')) || keyboard || zoomed || editing || document.hidden;
      const next = {
        // 安全領域はWebViewの親またはCSSに反映済み。ここでは加算しない。
        margin: Math.round(rect.top + (rect.height > 0 ? bannerGap : 0)), left: Math.round(rect.left), width: Math.floor(rect.width),
        height: Math.max(0, rect.height - bannerGap * 2),
        visible: !blocked && rect.top >= clipTop && rect.bottom <= clipBottom && rect.left >= clipLeft && rect.right <= clipRight,
      };
      const key = JSON.stringify(next);
      if (!retry && key === previous) return;
      previous = key;
      placeBanner(next, retry);
    };
    updateRef.current = () => update();
    const retry = () => update(true);
    const measure = () => update();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    const layers = new MutationObserver(measure);
    layers.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal', 'class', 'style'] });
    window.addEventListener('resize', measure);
    // captureでリスト・本文など内側のスクロールも受け取る。
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    document.addEventListener('visibilitychange', retry);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    window.addEventListener('online', retry);
    const removeResume = onAppResume(retry);
    update();
    return () => {
      updateRef.current = () => undefined;
      observer.disconnect();
      layers.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      document.removeEventListener('visibilitychange', retry);
      document.removeEventListener('focusin', measure);
      document.removeEventListener('focusout', measure);
      window.removeEventListener('online', retry);
      removeResume();
      stopBanner();
    };
  }, [supported]);
  // ReactがSDKの高さをDOMへ反映した後で初めて広告を可視にする。
  useLayoutEffect(() => { updateRef.current(); }, [height]);
  return supported ? <div ref={slot} className="calendar-ad-slot" style={{ height: height > 0 ? height + bannerGap * 2 : 0 }} aria-hidden="true" /> : null;
}
