import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundSection } from './BackgroundSection';

const mocks = vi.hoisted(() => ({ read: vi.fn(), store: vi.fn(), prepare: vi.fn(), apply: vi.fn() }));
vi.mock('../model/backgroundImage', () => ({
  readBackground: mocks.read, storeBackground: mocks.store, prepareBackground: mocks.prepare, applyBackground: mocks.apply,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(new Blob(['既存']));
  mocks.prepare.mockResolvedValue(new Blob(['新画像']));
  mocks.store.mockResolvedValue(undefined);
});

describe('背景画像の設定', () => {
  it('画像選択で保存と反映を行い、解除すると既定背景へ戻る', async () => {
    render(<BackgroundSection />);
    const input = screen.getByLabelText('背景画像を選ぶ');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { files: [new File(['x'], '背景.png', { type: 'image/png' })] } });
    await screen.findByText('背景画像を変更しました。');
    expect(mocks.store).toHaveBeenCalledWith(expect.any(Blob));
    expect(mocks.apply).toHaveBeenCalledWith(expect.any(Blob));
    fireEvent.click(screen.getByRole('button', { name: '背景画像を解除' }));
    await screen.findByText('背景画像を解除しました。');
    expect(mocks.store).toHaveBeenLastCalledWith(null);
    expect(mocks.apply).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('保存失敗では前の画像を保持してエラーを表示する', async () => {
    mocks.store.mockRejectedValue(new Error('容量不足'));
    render(<BackgroundSection />);
    const input = screen.getByLabelText('背景画像を選ぶ');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { files: [new File(['x'], '背景.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('保存できません');
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: '現在の背景画像' })).toBeInTheDocument();
  });
});
