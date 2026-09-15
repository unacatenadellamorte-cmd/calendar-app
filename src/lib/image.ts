/**
 * 画像のクライアント側リサイズ(新規 npm 依存を追加しない、純粋なブラウザ API のみ)。
 * アバター写真を長辺 `maxSize` にリサイズし、JPEG の data URI にして返す。
 * Supabase Storage は使わず、`profiles.avatar_data_url` にそのまま保存する前提。
 */

const JPEG_MIME = 'image/jpeg';
const JPEG_QUALITY = 0.85;

/** 画像ファイルを長辺 `maxSize` px 以下にリサイズし、JPEG data URI を返す。 */
export function resizeImageToDataUrl(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    const img = new Image();

    img.onload = () => {
      try {
        // 拡大はしない(小さい画像はそのままのサイズで使う)。
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas 2d context を取得できませんでした'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(JPEG_MIME, JPEG_QUALITY));
      } catch (e) {
        reject(e);
      } finally {
        cleanup();
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = objectUrl;
  });
}
