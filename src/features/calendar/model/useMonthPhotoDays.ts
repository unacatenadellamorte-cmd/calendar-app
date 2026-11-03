import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import {
  cancelDevicePhotoDayChecks,
  checkDevicePhotoPermission,
  isDevicePhotosSupported,
  listDevicePhotoDays,
  subscribeDevicePhotoAccessChange,
} from '@/platform/devicePhotos';

const NONE: ReadonlySet<string> = new Set();

/**
 * 月グリッドの各日に端末の写真があるかだけを調べる(日付の集合のみ。識別子・画像は持たない)。
 * `wanted`(設定ON・有効権利・ネイティブ)かつ前面の間だけ、既に許可済み(全部/一部)の場合に限って OS を呼ぶ。
 * 許可の要求はしない。日付範囲・利用者の変更、背面化、権利失効の最初の描画から古い結果を隠し、前面へ戻ったら読み直す。
 */
export function useMonthPhotoDays(dates: readonly string[], wanted: boolean, userId?: string): ReadonlySet<string> {
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
    if (!isDevicePhotosSupported()) return;
    let disposed = false;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!disposed) setNativeHidden(!isActive);
    });
    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);
  const active = wanted && !hidden && !nativeHidden;
  const scope = `${dates.join(',')}\u0000${userId ?? ''}`;
  // 日の写真欄での許可・選び直しの完了後に、OS の前後通知が無くても読み直す。
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    return subscribeDevicePhotoAccessChange(() => setReloadKey((key) => key + 1));
  }, [wanted]);
  const [result, setResult] = useState<{ scope: string; days: ReadonlySet<string> }>({ scope: '', days: NONE });

  useEffect(() => {
    if (!active) return;
    let stale = false;
    let inFlight = true;
    void (async () => {
      let days: ReadonlySet<string> = NONE;
      try {
        const permission = await checkDevicePhotoPermission();
        if (stale) return;
        if (permission === 'granted' || permission === 'limited') days = await listDevicePhotoDays(dates);
      } catch {
        days = NONE;
      }
      inFlight = false;
      if (!stale) setResult({ scope, days });
    })();
    return () => {
      stale = true;
      // 月送り・背景化・失効で不要になった照会は、画像読込に触れずネイティブ側でも止める。
      if (inFlight) cancelDevicePhotoDayChecks();
      setResult({ scope: '', days: NONE });
    };
    // dates は scope に畳み込み済み(同じ内容の配列で読み直さない)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scope, reloadKey]);

  return active && result.scope === scope ? result.days : NONE;
}
