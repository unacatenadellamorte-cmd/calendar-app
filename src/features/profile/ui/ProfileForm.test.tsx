import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';

const resizeImageToDataUrl = vi.fn();
vi.mock('@/lib/image', () => ({
  resizeImageToDataUrl: (file: File, maxSize: number) => resizeImageToDataUrl(file, maxSize),
}));

beforeEach(() => {
  resizeImageToDataUrl.mockReset();
});

describe('ProfileForm', () => {
  it('名前が空のときは送信できない', () => {
    render(<ProfileForm submitLabel="はじめる" onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'はじめる' })).toBeDisabled();
  });

  it('空白の名前からフォーカスを外すと理由を表示し、APIは呼ばない', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProfileForm submitLabel="保存する" onSubmit={onSubmit} />);
    const name = screen.getByLabelText('名前');
    await user.type(name, '   ');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('名前を入力してください');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('名前を入力すると送信できるようになる', async () => {
    const user = userEvent.setup();
    render(<ProfileForm submitLabel="はじめる" onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('名前'), '花子');
    expect(screen.getByRole('button', { name: 'はじめる' })).toBeEnabled();
  });

  it('送信すると trim した名前と avatarDataUrl(未選択なら null)を渡す', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<ProfileForm submitLabel="はじめる" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('名前'), '  花子  ');
    await user.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(onSubmit).toHaveBeenCalledWith({ displayName: '花子', avatarDataUrl: null });
  });

  it('保存成功時は完了フィードバックを表示する', async () => {
    const user = userEvent.setup();
    render(<ProfileForm submitLabel="保存する" onSubmit={vi.fn().mockResolvedValue(true)} />);
    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: '保存する' }));
    expect(screen.getByRole('status')).toHaveTextContent('保存しました。');
  });

  it('写真を選ぶとリサイズ結果を avatarDataUrl として渡す', async () => {
    resizeImageToDataUrl.mockResolvedValue('data:image/jpeg;base64,resized');
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<ProfileForm submitLabel="はじめる" onSubmit={onSubmit} />);
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('写真を選ぶ(任意)'), file);
    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(resizeImageToDataUrl).toHaveBeenCalledWith(file, 128);
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: '花子',
      avatarDataUrl: 'data:image/jpeg;base64,resized',
    });
  });

  it('10MBを超える写真は拒否し、リサイズを呼ばずにメッセージを表示する', async () => {
    const user = userEvent.setup();
    render(<ProfileForm submitLabel="はじめる" onSubmit={vi.fn()} />);
    const bigFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByLabelText('写真を選ぶ(任意)'), bigFile);
    expect(resizeImageToDataUrl).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '写真のファイルサイズが大きすぎます(10MBまで)',
    );
  });

  it('写真の処理に失敗したらメッセージを表示するが、送信はブロックしない', async () => {
    resizeImageToDataUrl.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<ProfileForm submitLabel="はじめる" onSubmit={onSubmit} />);
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('写真を選ぶ(任意)'), file);
    expect(screen.getByRole('alert')).toHaveTextContent(
      '写真を処理できませんでした。別の写真でお試しください',
    );
    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(onSubmit).toHaveBeenCalledWith({ displayName: '花子', avatarDataUrl: null });
  });

  it('初期値(既存プロフィール)を表示し、そのまま送信できる', async () => {
    render(
      <ProfileForm
        submitLabel="保存する"
        initialDisplayName="次郎"
        initialAvatarDataUrl="data:image/jpeg;base64,x"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('名前')).toHaveValue('次郎');
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled();
    expect(screen.getByText('写真を変更する')).toBeInTheDocument();
  });
});
