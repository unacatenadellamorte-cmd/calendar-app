import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundSection } from './BackgroundSection';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  store: vi.fn(),
  prepare: vi.fn(),
  apply: vi.fn(),
  createUrl: vi.fn(),
  revokeUrl: vi.fn(),
}));
vi.mock('../model/backgroundImage', () => ({
  readBackground: mocks.read,
  storeBackground: mocks.store,
  prepareBackground: mocks.prepare,
  applyBackground: mocks.apply,
  validateBackgroundFile: (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('JPEG・PNG・WebPの画像を選んでください。');
    if (file.size > 20 * 1024 * 1024) throw new Error('20MB以下の画像を選んでください。');
  },
}));
let imageShouldFail = false;
class TestImage {
  naturalWidth = 1200;
  naturalHeight = 800;
  onload?: () => void;
  onerror?: () => void;
  set src(_value: string) {
    queueMicrotask(() => (imageShouldFail ? this.onerror?.() : this.onload?.()));
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  imageShouldFail = false;
  mocks.read.mockResolvedValue(new Blob(['既存']));
  mocks.store.mockResolvedValue(undefined);
  mocks.prepare.mockResolvedValue(new Blob(['切り出し済み']));
  mocks.createUrl.mockReturnValue('blob:preview');
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('URL', { createObjectURL: mocks.createUrl, revokeObjectURL: mocks.revokeUrl });
});
async function openCrop() {
  render(<BackgroundSection />);
  const input = screen.getByLabelText('背景画像を選ぶ');
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, {
    target: { files: [new File(['x'], '背景.png', { type: 'image/png' })] },
  });
  await screen.findByRole('application', { name: '背景画像の切り出し範囲' });
}
describe('背景画像の切り出し編集', () => {
  it('キャンセルでは保存も反映もしない', async () => {
    await openCrop();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('確定時に選択範囲を渡して保存・反映する', async () => {
    await openCrop();
    fireEvent.change(screen.getByLabelText('拡大'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'この範囲で設定' }));
    await waitFor(() => expect(mocks.store).toHaveBeenCalledWith(expect.any(Blob)));
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.any(File),
      { zoom: 2, x: 0, y: 0 },
      expect.any(Number),
    );
    expect(mocks.apply).toHaveBeenCalledWith(expect.any(Blob));
  });
  it('不正なMIMEや容量超過ではdecodeを開始しない', async () => {
    render(<BackgroundSection />);
    const input = screen.getByLabelText('背景画像を選ぶ');
    await waitFor(() => expect(input).toBeEnabled());
    const before = mocks.createUrl.mock.calls.length;
    fireEvent.change(input, {
      target: { files: [new File(['x'], '背景.svg', { type: 'image/svg+xml' })] },
    });
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(mocks.createUrl).toHaveBeenCalledTimes(before);
    const huge = new File([new Uint8Array(20 * 1024 * 1024 + 1)], '大きい.png', {
      type: 'image/png',
    });
    fireEvent.change(input, { target: { files: [huge] } });
    await screen.findByText('20MB以下の画像を選んでください。');
    expect(mocks.createUrl).toHaveBeenCalledTimes(before);
  });
  it('保存失敗後に再試行できる', async () => {
    mocks.store.mockRejectedValueOnce(new Error('容量不足'));
    await openCrop();
    fireEvent.click(screen.getByRole('button', { name: 'この範囲で設定' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'この範囲で設定' }));
    await waitFor(() => expect(mocks.store).toHaveBeenCalledTimes(2));
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  });

  it('画像読込失敗後に別画像を選び直せる', async () => {
    imageShouldFail = true;
    render(<BackgroundSection />);
    const input = screen.getByLabelText('背景画像を選ぶ');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, {
      target: { files: [new File(['x'], '壊れた.png', { type: 'image/png' })] },
    });
    await screen.findByRole('alert');
    imageShouldFail = false;
    fireEvent.change(input, {
      target: { files: [new File(['x'], '再試行.png', { type: 'image/png' })] },
    });
    await screen.findByRole('application', { name: '背景画像の切り出し範囲' });
  });
});
