import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson } from './download';

afterEach(() => vi.restoreAllMocks());

describe('downloadJson', () => {
  it('Blob を作り、一時 <a download> をクリックして objectURL を解放する', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn((_url: string) => {});
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    downloadJson('out.json', { a: 1 });

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob.type).toBe('application/json');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(document.querySelector('a[download]')).toBeNull(); // 後始末される
    vi.unstubAllGlobals();
  });
});
