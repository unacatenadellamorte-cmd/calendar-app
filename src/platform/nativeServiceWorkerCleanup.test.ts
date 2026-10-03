import { describe, expect, it } from 'vitest';

describe('ネイティブService Worker掃除', () => {
  it('実装モジュールが公開ビルド用のネイティブ判定を持つ', async () => {
    const source = await import('node:fs/promises').then((fs) => fs.readFile('src/platform/nativeServiceWorkerCleanup.ts', 'utf8'));
    expect(source).toContain('VITE_NATIVE_TARGET');
    expect(source).toContain('getRegistrations');
    expect(source).toContain('caches.delete');
  });
});
