export interface CropGeometry {
  sx: number;
  sy: number;
  width: number;
  height: number;
}

export interface CropPosition {
  zoom: number;
  x: number;
  y: number;
}

/** 画像が枠を必ず満たすように、画像内の切り出し範囲を返す。x/y は -1〜1 の移動量。 */
export function getCropGeometry(
  imageWidth: number,
  imageHeight: number,
  frameAspect: number,
  position: CropPosition,
): CropGeometry {
  const aspect = Math.max(0.01, frameAspect);
  const baseWidth = Math.min(imageWidth, imageHeight * aspect);
  const baseHeight = baseWidth / aspect;
  const zoom = Math.max(1, position.zoom);
  const width = Math.min(imageWidth, baseWidth / zoom);
  const height = Math.min(imageHeight, baseHeight / zoom);
  const maxX = Math.max(0, (imageWidth - width) / 2);
  const maxY = Math.max(0, (imageHeight - height) / 2);
  const sx = (imageWidth - width) / 2 + Math.max(-1, Math.min(1, position.x)) * maxX;
  const sy = (imageHeight - height) / 2 + Math.max(-1, Math.min(1, position.y)) * maxY;
  return { sx, sy, width, height };
}
