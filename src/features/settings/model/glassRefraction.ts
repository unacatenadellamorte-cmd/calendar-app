/**
 * ガラスの面の屈折描画(背後だけを曲げる)。全テーマ共通(:root[data-glass])。
 *
 * 方式: 要素サイズごとに小さな変位マップ(角丸矩形の縁ほど強い凸レンズ形)をcanvasで一度だけ作り、
 * SVGの feImage + feDisplacementMap を `backdrop-filter: url(#id)` として各ガラス面へ割り当てる。
 * - 屈折は backdrop(背後)だけにかかり、カード内の文字・予定・ボタンは曲げない。
 * - R/G/B を僅かに異なる強さで変位させ、縁で背景の色が少しずれる分散を出す。
 * - 「屈折の強さ」(0〜100)は表示上の調整値であり、実測の屈折率(IOR)ではない。
 * - Chromium系(Android WebView等)のみ。WebKit(iOS WKWebView/Safari)・Firefoxは
 *   url()のbackdrop-filterで背景が曲がらないため、すりガラス+縁/反射のCSSに留める。
 * - 毎フレームの処理はしない。要素の追加/サイズ変化のときだけ、rAFでまとめて割り当てる。
 */

/** 屈折をかけるガラス面。theme-glass.css の面と同じ対象(ボトムシートは入力欄が多いので除外)。 */
export const GLASS_REFRACTION_SELECTOR = [
  '.app-shell .calendar-view-switcher',
  '.app-shell .calendar-date-nav',
  '.app-shell .app-bottom-tabs',
  '.app-shell .screen-header',
  '.app-shell .bg-surface-raised.border:not(.month-event-chip)',
  '.app-shell .upcoming-card',
  '.app-shell .pay-summary',
  '.app-shell .quick-shift-panel',
].join(',');

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFS_ID = 'glass-refraction-defs';
const FILTER_VAR = '--glass-refraction-filter';
/** 使われていない変位マップを残す上限。 */
const MAX_CACHED_FILTERS = 16;
/** マップは滑らかなので縮小して作り、feImageで引き伸ばす(転送量とメモリを抑える)。 */
const MAP_MAX_SIDE = 160;
/** 分散: 赤は少し強く、青は少し弱く曲げる。 */
const DISPERSION = 0.07;

export type GlassOpticsMode = 'refract' | 'frost' | 'off';

let strength = 0;
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let frame = 0;
let transparencyQuery: MediaQueryList | null = null;
const tracked = new Map<Element, string>();
const pending = new Set<Element>();
const filters = new Map<string, { node: SVGFilterElement; band: number; maps: SVGFEDisplacementMapElement[] }>();

/** 0〜100の屈折の強さを0〜1へ。数値以外・範囲外も安全に扱う。 */
function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value / 100)) : 0;
}

/**
 * 背景を実際に曲げられる描画系か。CSS.supportsだけでは判定しない
 * (WebKitは構文を受け付けても背景を変位させない)。Chromium系のエンジンだけを対象にする。
 */
export function canRefractBackdrop(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  supports: ((property: string, value: string) => boolean) | undefined = typeof CSS === 'undefined' ? undefined : CSS.supports?.bind(CSS),
): boolean {
  if (!nav || !supports) return false;
  if (!supports('backdrop-filter', 'url(#a)') && !supports('-webkit-backdrop-filter', 'url(#a)')) return false;
  const ua = nav.userAgent;
  // iOS/iPadOSはどのブラウザーでもWebKit。iPadOSはMacintoshを名乗るため触点数で除外する。
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return false;
  return /\b(?:Headless)?(?:Chrome|Chromium)\/\d+/.test(ua);
}

function reducedTransparency(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches === true;
}

/** 現在の描画方式。報告・CSSの切替用に :root[data-glass-optics] へも出す。 */
export function currentGlassOpticsMode(): GlassOpticsMode {
  if (typeof document === 'undefined' || !document.documentElement.hasAttribute('data-glass')) return 'off';
  if (strength > 0 && canRefractBackdrop() && !reducedTransparency()) return 'refract';
  return 'frost';
}

/**
 * 角丸矩形の縁ほど強い凸レンズ形の変位マップ(R=横, G=縦, 128=変位なし)。
 * 縁の内側へ参照点を寄せるため、背景は縁で拡大され、中央は変位しない。
 */
export function buildDisplacementMap(width: number, height: number, radius: number, band: number): string | null {
  if (typeof document === 'undefined') return null;
  const scale = Math.min(1, MAP_MAX_SIDE / Math.max(width, height));
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    return null;
  }
  if (!context) return null;
  const image = context.createImageData(w, h);
  const r = Math.min(radius, width / 2, height / 2);
  for (let j = 0; j < h; j += 1) {
    const y = ((j + 0.5) / h) * height - height / 2;
    for (let i = 0; i < w; i += 1) {
      const x = ((i + 0.5) / w) * width - width / 2;
      // 角丸矩形の符号付き距離(内側が負)と、最寄りの縁の法線。
      const qx = Math.abs(x) - (width / 2 - r);
      const qy = Math.abs(y) - (height / 2 - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const inside = -(outside + Math.min(Math.max(qx, qy), 0) - r);
      let nx = 0;
      let ny = 0;
      if (outside > 0) {
        nx = (ox / outside) * Math.sign(x);
        ny = (oy / outside) * Math.sign(y);
      } else if (qx > qy) nx = Math.sign(x);
      else ny = Math.sign(y);
      const t = Math.min(1, Math.max(0, inside / band));
      // (1-t)^2: 縁で最大、band より内側は0。単調な写像になるよう強さ側で上限を設ける。
      const k = (1 - t) * (1 - t);
      const p = (j * w + i) * 4;
      image.data[p] = Math.round(128 - 127 * k * nx);
      image.data[p + 1] = Math.round(128 - 127 * k * ny);
      image.data[p + 2] = 128;
      image.data[p + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * 強さ(0〜1)と縁の帯幅(px)から feDisplacementMap の scale を求める。
 * 最大でも帯幅の0.9倍に抑え、縁で背景が折り返さない(単調な拡大に留める)ようにする。
 */
export function displacementScale(strengthUnit: number, band: number): number {
  const s = Number.isFinite(strengthUnit) ? Math.min(1, Math.max(0, strengthUnit)) : 0;
  return Math.round(0.9 * band * s * 10) / 10;
}

/** 縁の帯幅。小さな面ほど細くし、中央の平らな部分を残す。 */
export function refractionBand(width: number, height: number): number {
  return Math.round(Math.min(30, Math.max(8, Math.min(width, height) * 0.24)));
}

function defsRoot(): SVGSVGElement {
  let svg = document.getElementById(DEFS_ID) as SVGSVGElement | null;
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = DEFS_ID;
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
  }
  return svg;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function ensureFilter(width: number, height: number, radius: number): string | null {
  const key = `glass-rf-${width}x${height}r${radius}`;
  if (filters.has(key)) return key;
  const band = refractionBand(width, height);
  const url = buildDisplacementMap(width, height, radius, band);
  if (!url) return null;
  const size = { x: '0', y: '0', width: String(width), height: String(height) };
  const filter = el('filter', {
    id: key,
    ...size,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });
  filter.appendChild(el('feImage', { ...size, href: url, preserveAspectRatio: 'none', result: 'map' }));
  const maps: SVGFEDisplacementMapElement[] = [];
  const channels = [
    ['r', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['g', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['b', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
  ] as const;
  for (const [name, matrix] of channels) {
    const displacement = el('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'map',
      scale: '0',
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: `d${name}`,
    });
    maps.push(displacement);
    filter.appendChild(displacement);
    filter.appendChild(el('feColorMatrix', { in: `d${name}`, type: 'matrix', values: matrix, result: name }));
  }
  filter.appendChild(el('feComposite', { in: 'r', in2: 'g', operator: 'arithmetic', k2: '1', k3: '1', result: 'rg' }));
  filter.appendChild(el('feComposite', { in: 'rg', in2: 'b', operator: 'arithmetic', k2: '1', k3: '1' }));
  defsRoot().appendChild(filter);
  const entry = { node: filter, band, maps };
  filters.set(key, entry);
  applyScale(entry);
  return key;
}

function applyScale(entry: { band: number; maps: SVGFEDisplacementMapElement[] }): void {
  const base = displacementScale(strength, entry.band);
  const factors = [1 + DISPERSION, 1, 1 - DISPERSION];
  entry.maps.forEach((map, index) => map.setAttribute('scale', String(Math.round(base * factors[index]! * 10) / 10)));
}

function release(element: Element): void {
  (element as HTMLElement).style?.removeProperty(FILTER_VAR);
  tracked.delete(element);
  resizeObserver?.unobserve(element);
}

function assign(element: Element): void {
  if (!element.isConnected) {
    release(element);
    return;
  }
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 16 || height < 16) {
    (element as HTMLElement).style.removeProperty(FILTER_VAR);
    tracked.set(element, '');
    return;
  }
  const radius = Math.round(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0);
  const key = ensureFilter(width, height, radius);
  if (!key) return;
  if (tracked.get(element) !== key) (element as HTMLElement).style.setProperty(FILTER_VAR, `url(#${key})`);
  tracked.set(element, key);
}

function evictUnused(): void {
  if (filters.size <= MAX_CACHED_FILTERS) return;
  const used = new Set(tracked.values());
  for (const [key, entry] of filters) {
    if (filters.size <= MAX_CACHED_FILTERS) break;
    if (!used.has(key)) {
      entry.node.remove();
      filters.delete(key);
    }
  }
}

function flush(): void {
  frame = 0;
  if (currentGlassOpticsMode() !== 'refract') return;
  for (const element of [...tracked.keys()]) if (!element.isConnected) release(element);
  for (const element of document.querySelectorAll(GLASS_REFRACTION_SELECTOR)) {
    if (!tracked.has(element)) {
      tracked.set(element, '');
      resizeObserver?.observe(element);
      pending.add(element);
    }
  }
  for (const element of pending) assign(element);
  pending.clear();
  evictUnused();
}

function schedule(): void {
  if (frame || typeof requestAnimationFrame === 'undefined') return;
  frame = requestAnimationFrame(flush);
}

function start(): void {
  if (!mutationObserver && typeof MutationObserver !== 'undefined') {
    // 画面の切替で面が増減した時だけ反応する(属性・文字の変化は見ない)。
    mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => record.addedNodes.length > 0 || record.removedNodes.length > 0)) schedule();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) pending.add(entry.target);
      schedule();
    });
  }
  schedule();
}

function stop(): void {
  mutationObserver?.disconnect();
  mutationObserver = null;
  for (const element of [...tracked.keys()]) release(element);
  resizeObserver?.disconnect();
  resizeObserver = null;
  pending.clear();
  if (frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
  frame = 0;
  for (const entry of filters.values()) entry.node.remove();
  filters.clear();
  document.getElementById(DEFS_ID)?.remove();
}

/** OSの透過軽減を実行中に切り替えた時も、変位用リソースを停止・復元する。 */
function onTransparencyChanged(): void {
  syncGlassRefraction();
}

/**
 * テーマ・強さ・端末設定に合わせて屈折を開始/停止する。applyTheme と強さ変更の両方から呼ぶ。
 * 屈折できない環境ではCSSのすりガラス+縁/反射のまま(data-glass-optics="frost")。
 */
export function syncGlassRefraction(nextStrength?: number): void {
  if (typeof document === 'undefined') return;
  if (nextStrength !== undefined) strength = unit(nextStrength);
  const mode = currentGlassOpticsMode();
  const root = document.documentElement;
  if (mode === 'off') {
    transparencyQuery?.removeEventListener('change', onTransparencyChanged);
    transparencyQuery = null;
  } else if (!transparencyQuery && typeof window.matchMedia === 'function') {
    transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
    transparencyQuery.addEventListener('change', onTransparencyChanged);
  }
  if (mode === 'off') root.removeAttribute('data-glass-optics');
  else root.setAttribute('data-glass-optics', mode);
  if (mode !== 'refract' || !document.body) {
    stop();
    return;
  }
  for (const entry of filters.values()) applyScale(entry);
  start();
}
