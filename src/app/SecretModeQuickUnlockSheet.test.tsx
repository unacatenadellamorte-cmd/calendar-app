import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * `useSecretMode()` をモックしてシート単体の挙動を検証する
 * (`SecretModeSettingsScreen.test.tsx` と同じ方式)。ハッシュ照合そのものは
 * `SecretModeProvider.test.tsx` の対象。
 */

const unlock = vi.fn();
const dismissError = vi.fn();
const onClose = vi.fn();

let state: { errorKey: string | null } = { errorKey: null };

vi.mock('@/app/secret-mode-context', () => ({
  useSecretMode: () => ({ ...state, unlock, dismissError }),
}));

const { SecretModeQuickUnlockSheet } = await import('./SecretModeQuickUnlockSheet');

beforeEach(() => {
  unlock.mockReset().mockResolvedValue(true);
  dismissError.mockReset();
  onClose.mockReset();
  state = { errorKey: null };
});

describe('SecretModeQuickUnlockSheet', () => {
  it('open=false なら何も描画しない', () => {
    render(<SecretModeQuickUnlockSheet open={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('open=true ならパスコード入力欄1つ(type=password, inputMode=numeric)と送信ボタンを出す', () => {
    render(<SecretModeQuickUnlockSheet open onClose={onClose} />);
    const input = screen.getByLabelText('パスコード');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('inputMode', 'numeric');
    expect(screen.getByRole('button', { name: '解除する' })).toBeInTheDocument();
    // 「パスコードを変更」機能は持たない(spec Never)。
    expect(screen.queryByText('パスコードを変更')).not.toBeInTheDocument();
  });

  it('入力が空の間は送信ボタンを disabled にする', () => {
    render(<SecretModeQuickUnlockSheet open onClose={onClose} />);
    expect(screen.getByRole('button', { name: '解除する' })).toBeDisabled();
  });

  it('正しいパスコードを送信すると unlock を呼び、成功したら onClose を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<SecretModeQuickUnlockSheet open onClose={onClose} />);
    await user.type(screen.getByLabelText('パスコード'), '1234');
    await user.click(screen.getByRole('button', { name: '解除する' }));
    expect(unlock).toHaveBeenCalledWith('1234');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('誤ったパスコードでは onClose を呼ばず、シートは開いたままエラーを表示する', async () => {
    unlock.mockResolvedValue(false);
    state.errorKey = 'secret/incorrect-passcode';
    const user = userEvent.setup();
    render(<SecretModeQuickUnlockSheet open onClose={onClose} />);
    await user.type(screen.getByLabelText('パスコード'), '9999');
    await user.click(screen.getByRole('button', { name: '解除する' }));
    expect(unlock).toHaveBeenCalledWith('9999');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('パスコードが違います');
    expect(screen.getByLabelText('パスコード')).toBeInTheDocument();
  });

  it('送信中は送信ボタンを disabled にし「確認中…」を表示する', async () => {
    unlock.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<SecretModeQuickUnlockSheet open onClose={onClose} />);
    await user.type(screen.getByLabelText('パスコード'), '1234');
    await user.click(screen.getByRole('button', { name: '解除する' }));
    expect(screen.getByRole('button', { name: '確認中…' })).toBeDisabled();
  });

  it('開くたびに直前のエラー・送信中フラグをリセットする', () => {
    const { rerender } = render(<SecretModeQuickUnlockSheet open={false} onClose={onClose} />);
    dismissError.mockClear();
    rerender(<SecretModeQuickUnlockSheet open onClose={onClose} />);
    expect(dismissError).toHaveBeenCalled();
  });
});
