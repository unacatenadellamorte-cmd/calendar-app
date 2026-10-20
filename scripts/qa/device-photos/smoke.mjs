// OSを模擬しないブリッジ結合試験。架空画像の登録と全部許可を済ませてから実行する。
import { execFileSync } from 'node:child_process';
const expression = `(async () => {
  const api = (method, options = {}) => Capacitor.nativePromise('DevicePhotos', method, options);
  if (Capacitor.isLoggingEnabled) throw new Error('自動ログが有効です');
  const permission = await api('checkPermission');
  if (permission.status !== 'granted') throw new Error('全部許可が必要です');
  const pages = [];
  for (const offset of [0, 40, 80]) pages.push(await api('listAssets', { fromMs: 1792422000000, toMs: 1792508400000, offset, limit: 40 }));
  const assets = pages.flatMap(page => page.assets);
  if (pages.some(page => page.assets.length !== 40) || !pages[0].hasMore || !pages[1].hasMore || pages[2].hasMore) throw new Error('分割取得が不正です');
  if (new Set(assets.map(asset => asset.id)).size !== 120 || assets.some(asset => asset.createdMs < 1792422000000 || asset.createdMs >= 1792508400000)) throw new Error('対象日や重複が不正です');
  for (const [maxSide, allowNetwork] of [[256, false], [1600, true]]) {
    const { dataUrl } = await api('loadImage', { id: assets[0].id, maxSide, allowNetwork });
    const image = new Image(); image.src = dataUrl; await image.decode();
    if (Math.max(image.naturalWidth, image.naturalHeight) > maxSide) throw new Error('表示サイズが上限を超えています');
    image.src = '';
  }
  const pending = assets.slice(0, 20).map(asset => api('loadImage', { id: asset.id, maxSide: 1600, allowNetwork: false }).then(() => '完了', error => error.code === 'cancelled' ? '取消' : '失敗'));
  await api('cancelLoads');
  const outcomes = await Promise.race([Promise.all(pending), new Promise((_, reject) => setTimeout(() => reject(new Error('取消後の要求が未完了です')), 10000))]);
  if (!outcomes.includes('取消') || outcomes.includes('失敗')) throw new Error('取消結果が不正です');
  return { 件数: assets.length, 分割件数: pages.map(page => page.assets.length), 日付境界: '成功', 表示サイズ: '成功', 取消完了: outcomes.length, 自動ログ: '無効' };
})()`;
const result = execFileSync(process.execPath, ['scripts/qa/device-photos/cdp.mjs', expression], { encoding: 'utf8' });
console.log(result.trim());
