import { openDB } from 'idb';
import { getCropGeometry, type CropPosition } from './cropGeometry';

const DATABASE = 'calendar-app-appearance';
const STORE = 'background';

async function database() {
  return openDB(DATABASE, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
}

export async function readBackground(): Promise<Blob | undefined> {
  const db = await database();
  try {
    return (await db.get(STORE, 'image')) as Blob | undefined;
  } finally {
    db.close();
  }
}

export async function storeBackground(image: Blob | null): Promise<void> {
  const db = await database();
  try {
    if (image) await db.put(STORE, image, 'image');
    else await db.delete(STORE, 'image');
  } finally {
    db.close();
  }
}

export function validateBackgroundFile(file: File): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('JPEG・PNG・WebPの画像を選んでください。');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB以下の画像を選んでください。');
}

/** 写真を縮小して保存し、元ファイルの位置情報などを引き継がない。 */
export async function prepareBackground(
  file: File,
  position?: CropPosition,
  frameAspect = 1,
): Promise<Blob> {
  validateBackgroundFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('画像を読み込めませんでした。別の画像を選んでください。'));
      image.src = url;
    });
    const crop = getCropGeometry(
      image.naturalWidth,
      image.naturalHeight,
      frameAspect,
      position ?? { zoom: 1, x: 0, y: 0 },
    );
    const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像を処理できませんでした。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('画像を処理できませんでした。'))),
        'image/jpeg',
        0.85,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

let activeUrl: string | null = null;
let revision = 0;

export function applyBackground(image: Blob | null): void {
  revision += 1;
  const nextUrl = image ? URL.createObjectURL(image) : null;
  const root = document.documentElement;
  if (nextUrl) {
    root.style.setProperty('--app-background-image', `url("${nextUrl}")`);
    root.dataset.background = 'custom';
  } else {
    root.style.removeProperty('--app-background-image');
    delete root.dataset.background;
  }
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeUrl = nextUrl;
}

export async function initBackground(): Promise<void> {
  const initialRevision = revision;
  try {
    const image = await readBackground();
    if (revision === initialRevision) applyBackground(image ?? null);
  } catch {
    // 保存領域が使えない場合も既定の背景で起動できる。
  }
}
