import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const layers: (() => void)[] = [];

/** 最前面のレイヤーだけを閉じ、ネイティブの履歴移動を抑止する。 */
export function registerLayerBack(close: () => void): () => void {
  layers.push(close);
  let active = true;
  const handle = Capacitor.getPlatform() === 'android'
    ? App.addListener('backButton', () => {
      if (active && layers.at(-1) === close) close();
    })
    : null;
  return () => {
    active = false;
    const index = layers.indexOf(close);
    if (index >= 0) layers.splice(index, 1);
    void handle?.then((listener) => listener.remove());
  };
}
