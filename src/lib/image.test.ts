import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resizeImageToDataUrl } from './image';

/**
 * jsdom は <canvas> の 2D コンテキストも Image のデコードも実装していないため、
 * ここで最小限にモックする(実ブラウザの描画結果そのものは検証しない)。
 */

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width: number;
  height: number;
  private _src = '';

  constructor(width = 800, height = 400) {
    this.width = width;
    this.height = height;
  }

  set src(value: string) {
    this._src = value;
    if (value === 'blob:fail') {
      queueMicrotask(() => this.onerror?.());
    } else {
      queueMicrotask(() => this.onload?.());
    }
  }

  get src() {
    return this._src;
  }
}

let createObjectUrlMock: ReturnType<typeof vi.fn>;
let revokeObjectUrlMock: ReturnType<typeof vi.fn>;
let getContextMock: ReturnType<typeof vi.fn>;
let toDataUrlMock: ReturnType<typeof vi.fn>;
let drawImageMock: ReturnType<typeof vi.fn>;

function fakeFile(): File {
  return new File(['dummy'], 'photo.png', { type: 'image/png' });
}

beforeEach(() => {
  createObjectUrlMock = vi.fn(() => 'blob:mock');
  revokeObjectUrlMock = vi.fn();
  URL.createObjectURL = createObjectUrlMock as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectUrlMock as unknown as typeof URL.revokeObjectURL;

  vi.stubGlobal('Image', MockImage);

  drawImageMock = vi.fn();
  getContextMock = vi.fn(() => ({ drawImage: drawImageMock }));
  toDataUrlMock = vi.fn(() => 'data:image/jpeg;base64,mock');
  HTMLCanvasElement.prototype.getContext =
    getContextMock as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL =
    toDataUrlMock as unknown as typeof HTMLCanvasElement.prototype.toDataURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resizeImageToDataUrl', () => {
  it('長辺が maxSize になるよう縮小して JPEG の data URI を返す', async () => {
    vi.stubGlobal(
      'Image',
      class extends MockImage {
        constructor() {
          super(800, 400);
        }
      },
    );
    const url = await resizeImageToDataUrl(fakeFile(), 128);
    expect(url).toBe('data:image/jpeg;base64,mock');
    expect(toDataUrlMock).toHaveBeenCalledWith('image/jpeg', 0.85);
    // 800x400 → 長辺128に収める(比率維持): 128x64
    expect(drawImageMock).toHaveBeenCalledWith(expect.anything(), 0, 0, 128, 64);
  });

  it('maxSize より小さい画像は拡大しない', async () => {
    vi.stubGlobal(
      'Image',
      class extends MockImage {
        constructor() {
          super(50, 30);
        }
      },
    );
    await resizeImageToDataUrl(fakeFile(), 128);
    expect(drawImageMock).toHaveBeenCalledWith(expect.anything(), 0, 0, 50, 30);
  });

  it('createObjectURL でオブジェクト URL を作り、完了後に revokeObjectURL で解放する', async () => {
    await resizeImageToDataUrl(fakeFile(), 128);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:mock');
  });

  it('画像の読み込みに失敗したら reject する', async () => {
    createObjectUrlMock.mockReturnValue('blob:fail');
    await expect(resizeImageToDataUrl(fakeFile(), 128)).rejects.toThrow();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:fail');
  });

  it('canvas の 2d context が取得できなければ reject する', async () => {
    getContextMock.mockReturnValue(null);
    await expect(resizeImageToDataUrl(fakeFile(), 128)).rejects.toThrow();
  });
});
