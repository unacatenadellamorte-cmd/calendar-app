import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { isDevicePhotosSupported } from '@/platform/devicePhotos';
import {
  checkDevicePhotoPermission,
  listDevicePhotosForDay,
  releaseDevicePhotoCache,
  reselectLimitedDevicePhotos,
  requestDevicePhotoPermission,
  type DevicePhotoAsset,
  type DevicePhotoPermission,
} from '@/platform/devicePhotos';

export type DayPhotosState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'needs-permission'; permission: 'prompt' | 'denied' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      limited: boolean;
      assets: DevicePhotoAsset[];
      hasMore: boolean;
      loadingMore: boolean;
      loadMoreFailed: boolean;
      nextOffset: number;
    };

/**
 * 選択日の端末写真を読む。`active`(設定ON かつ 写真欄が開いている)の間だけ OS を呼ぶ。
 * 日付変更・非アクティブ化・画面退出では、進行中の要求の結果を捨てて画像を解放する。
 */
export function useDayPhotos(date: string, wanted: boolean, userId?: string) {
  const [state, setState] = useState<DayPhotosState>({ kind: 'idle' });
  // 背面にある間は読まず、画像も持たない。前面へ戻ったら権限の確認から読み直す。
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');
  const [nativeHidden, setNativeHidden] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const onChange = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onChange);
    onChange();
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [wanted]);
  useEffect(() => {
    if (!wanted || !isDevicePhotosSupported()) return;
    let disposed = false;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!disposed) setNativeHidden(!isActive);
    });
    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove()).catch(() => {});
    };
  }, [wanted]);
  const active = wanted && !hidden && !nativeHidden;
  // 再確認・再試行のたびに進め、権限の確認から読み直す。
  const [reloadKey, setReloadKey] = useState(0);
  const runRef = useRef(0);
  const scope = `${date}\u0000${userId ?? ''}`;
  const permissionRequest = useRef(0);
  const permissionPending = useRef(false);
  const currentView = useRef({ scope, wanted, active });
  currentView.current = { scope, wanted, active };
  const moreRequest = useRef<object | null>(null);
  const stateScope = useRef(scope);
  const stateRef = useRef(state);
  stateRef.current = state;

  // OSダイアログによる背面化では要求を破棄しない。利用者・日付・開閉の変更では破棄する。
  useEffect(() => () => {
    permissionRequest.current += 1;
    permissionPending.current = false;
  }, [scope, wanted]);

  // 権限に応じて表示を決める。許可された範囲(全部/一部)だけを読み、古い応答は捨てる。
  const applyPermission = useCallback(
    async (run: number, permission: DevicePhotoPermission) => {
      if (run !== runRef.current) return;
      if (permission === 'prompt' || permission === 'denied') {
        setState({ kind: 'needs-permission', permission });
        return;
      }
      if (permission !== 'granted' && permission !== 'limited') {
        setState({ kind: 'error' });
        return;
      }
      const page = await listDevicePhotosForDay(date, 0);
      if (run !== runRef.current) return;
      setState({
        kind: 'ready',
        limited: permission === 'limited',
        assets: page.assets,
        hasMore: page.hasMore,
        loadingMore: false,
        loadMoreFailed: false,
        nextOffset: page.nextOffset ?? 0,
      });
    },
    [date],
  );

  useEffect(() => {
    if (!active) return;
    const run = ++runRef.current;
    stateScope.current = scope;
    setState({ kind: 'loading' });
    void checkDevicePhotoPermission()
      .then((permission) => applyPermission(run, permission))
      .catch(() => {
        if (run === runRef.current) setState({ kind: 'error' });
      });
    return () => {
      runRef.current += 1;
      moreRequest.current = null;
      releaseDevicePhotoCache();
      setState({ kind: 'idle' });
    };
    // userId は読み直しの合図(利用者が変わったら前の利用者の画像を持たない)。
  }, [active, applyPermission, reloadKey, userId, scope]);

  /** 利用者が操作した時だけ、OS の権限ダイアログを出す。 */
  const requestPermission = useCallback(async () => {
    if (!currentView.current.wanted || permissionPending.current) return;
    permissionPending.current = true;
    const request = ++permissionRequest.current;
    runRef.current += 1;
    setState({ kind: 'loading' });
    try {
      const permission = await requestDevicePhotoPermission();
      if (request !== permissionRequest.current || currentView.current.scope !== scope) return;
      // 復帰時の確認が先に走っていても、完了した許可を現在の一覧へ反映する。
      if (currentView.current.active) await applyPermission(++runRef.current, permission);
    } catch {
      if (request === permissionRequest.current && currentView.current.active && currentView.current.scope === scope) {
        runRef.current += 1;
        setState({ kind: 'error' });
      }
    } finally {
      if (request === permissionRequest.current) permissionPending.current = false;
    }
  }, [applyPermission, scope]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  /** 一部許可の写真を OS の選択画面で選び直し、新しい許可範囲で読み直す。 */
  const reselectLimited = useCallback(async () => {
    const run = runRef.current;
    try {
      await reselectLimitedDevicePhotos();
      if (run === runRef.current) reload();
    } catch {
      if (run === runRef.current) {
        releaseDevicePhotoCache();
        setState({ kind: 'error' });
      }
    }
  }, [reload]);

  /** 続きを40件取得して末尾へ足す。同じ画像は重複させず、古い応答は捨てる。 */
  const loadMore = useCallback(async () => {
    const run = runRef.current;
    const current = stateRef.current;
    if (!currentView.current.active || currentView.current.scope !== scope || moreRequest.current || current.kind !== 'ready' || !current.hasMore || current.loadingMore) return;
    const request = {};
    moreRequest.current = request;
    setState({ ...current, loadingMore: true, loadMoreFailed: false });
    try {
      const page = await listDevicePhotosForDay(date, current.nextOffset);
      if (run !== runRef.current) return;
      const known = new Set(current.assets.map((asset) => asset.id));
      setState({
        ...current,
        assets: [...current.assets, ...page.assets.filter((asset) => !known.has(asset.id))],
        hasMore: page.hasMore,
        loadingMore: false,
        loadMoreFailed: false,
        nextOffset: page.nextOffset ?? current.nextOffset,
      });
    } catch {
      if (run === runRef.current) setState({ ...current, loadingMore: false, loadMoreFailed: true });
    } finally {
      if (moreRequest.current === request) moreRequest.current = null;
    }
  }, [date, scope]);

  // 効果の後処理を待たず、日付・利用者が変わった最初の描画から前の画像を隠す。
  const visible = active && stateScope.current === scope;
  const visibleState: DayPhotosState = !active ? { kind: 'idle' } : visible ? state : { kind: 'loading' };
  return { state: visibleState, active: visible, requestPermission, reload, reselectLimited, loadMore };
}
