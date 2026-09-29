import { describe, expect, it, vi } from 'vitest';
import { applyBackground, initBackground, prepareBackground, readBackground, storeBackground } from './backgroundImage';

describe('背景の端末保存', () => {
  it('保存した画像を再読込でき、解除すると消える', async () => {
    const blob = new Blob(['画像'], { type: 'image/jpeg' });
    await storeBackground(blob);
    expect(await readBackground()).toBeDefined();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    await initBackground();
    expect(document.documentElement.dataset.background).toBe('custom');
    expect(document.documentElement.style.getPropertyValue('--app-background-image')).toContain('blob:test');
    await storeBackground(null);
    applyBackground(null);
    expect(await readBackground()).toBeUndefined();
    expect(document.documentElement.dataset.background).toBeUndefined();
    vi.unstubAllGlobals();
  });
  it('非対応形式と大きすぎる画像を保存前に拒否する', async () => {
    await expect(prepareBackground(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPEG');
    const large = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    await expect(prepareBackground(large)).rejects.toThrow('20MB');
    expect(await readBackground()).toBeUndefined();
  });
});
