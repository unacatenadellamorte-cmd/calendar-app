import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * `useSecretMode()` をモックして画面の分岐だけを検証する(`ConnectionsSection.test.tsx` と
 * 同じ方式)。`SecretModeProvider` 自体の挙動(ハッシュ比較等)は `SecretModeProvider.test.tsx`
 * で別途検証済み。
 */

const unlock = vi.fn();
const lock = vi.fn();
const setPasscode = vi.fn();
const dismissError = vi.fn();

let state: {
  hasPasscode: boolean;
  unlocked: boolean;
  errorKey: string | null;
} = { hasPasscode: false, unlocked: false, errorKey: null };

vi.mock('@/app/secret-mode-context', () => ({
  useSecretMode: () => ({ ...state, unlock, lock, setPasscode, dismissError }),
}));

const { SecretModeSettingsScreen } = await import('./SecretModeSettingsScreen');

beforeEach(() => {
  unlock.mockReset().mockResolvedValue(true);
  lock.mockReset();
  setPasscode.mockReset().mockResolvedValue(true);
  dismissError.mockReset();
  state = { hasPasscode: false, unlocked: false, errorKey: null };
});

describe('SecretModeSettingsScreen', () => {
  it('パスコード未設定なら設定フォームを出し、ON/OFFトグルは出さない(I/O Matrix)', () => {
    render(<SecretModeSettingsScreen />);
    expect(screen.getByLabelText('パスコード(4〜8文字の半角英数字)')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('未設定フォームで入力して送信すると setPasscode を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.type(screen.getByLabelText('パスコード(4〜8文字の半角英数字)'), 'Ab12');
    await user.click(screen.getByRole('button', { name: 'パスコードを設定する' }));
    expect(setPasscode).toHaveBeenCalledWith('Ab12');
  });

  it('未設定フォームで形式不正エラーを表示する', async () => {
    setPasscode.mockResolvedValue(false);
    state.errorKey = 'secret/invalid-passcode';
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.type(screen.getByLabelText('パスコード(4〜8文字の半角英数字)'), '12');
    await user.click(screen.getByRole('button', { name: 'パスコードを設定する' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'パスコードは半角英数字4〜8文字で入力してください',
    );
  });

  it('設定済み・ロック中なら ON/OFF トグルを出し、ロック中が選択されている', () => {
    state = { hasPasscode: true, unlocked: false, errorKey: null };
    render(<SecretModeSettingsScreen />);
    expect(screen.getByRole('radio', { name: /ロック中/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /解除中/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('ロック中に「解除中」を押すとパスコード入力欄が出る(即座には解除しない)', async () => {
    state = { hasPasscode: true, unlocked: false, errorKey: null };
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.click(screen.getByRole('radio', { name: /解除中/ }));
    expect(screen.getByLabelText('パスコード')).toBeInTheDocument();
    expect(unlock).not.toHaveBeenCalled();
  });

  it('パスコード入力欄で正しい値を送信すると unlock を呼ぶ', async () => {
    state = { hasPasscode: true, unlocked: false, errorKey: null };
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.click(screen.getByRole('radio', { name: /解除中/ }));
    await user.type(screen.getByLabelText('パスコード'), '1234');
    await user.click(screen.getByRole('button', { name: '解除する' }));
    expect(unlock).toHaveBeenCalledWith('1234');
  });

  it('誤ったパスコードでは unlock を呼んでも解除トグルを閉じたままにする', async () => {
    unlock.mockResolvedValue(false);
    state = { hasPasscode: true, unlocked: false, errorKey: null };
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.click(screen.getByRole('radio', { name: /解除中/ }));
    await user.type(screen.getByLabelText('パスコード'), '9999');
    await user.click(screen.getByRole('button', { name: '解除する' }));
    expect(unlock).toHaveBeenCalledWith('9999');
    // unlock が false を返した(誤りだった)ので、入力欄は開いたまま
    expect(screen.getByLabelText('パスコード')).toBeInTheDocument();
  });

  it('errorKey があれば incorrect-passcode の文言を表示する', () => {
    state = { hasPasscode: true, unlocked: false, errorKey: 'secret/incorrect-passcode' };
    render(<SecretModeSettingsScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('パスコードが違います');
  });

  it('解除中に「ロック中」を押すとパスコード不要で即座に lock を呼ぶ', async () => {
    state = { hasPasscode: true, unlocked: true, errorKey: null };
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.click(screen.getByRole('radio', { name: /ロック中/ }));
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('解除中(unlocked=true)なら「パスコードを変更」で変更フォームが出て、送信すると setPasscode を呼ぶ', async () => {
    state = { hasPasscode: true, unlocked: true, errorKey: null };
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.click(screen.getByRole('button', { name: 'パスコードを変更' }));
    await user.type(screen.getByLabelText('新しいパスコード(4〜8文字の半角英数字)'), '5678');
    await user.click(screen.getByRole('button', { name: '保存する' }));
    expect(setPasscode).toHaveBeenCalledWith('5678');
  });

  it('ロック中(unlocked=false)は「パスコードを変更」導線ごと出さない(レビュー指摘: 現行パスコード確認なしの変更を防ぐ)', () => {
    state = { hasPasscode: true, unlocked: false, errorKey: null };
    render(<SecretModeSettingsScreen />);
    expect(screen.queryByRole('button', { name: 'パスコードを変更' })).not.toBeInTheDocument();
  });

  it('パスコード入力欄は type="password"(平文表示しない)', () => {
    render(<SecretModeSettingsScreen />);
    expect(screen.getByLabelText('パスコード(4〜8文字の半角英数字)')).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('送信中は「ロック中」「解除中」ラジオボタンとも操作不能にする', async () => {
    state = { hasPasscode: true, unlocked: false, errorKey: null };
    unlock.mockImplementation(() => new Promise(() => {})); // 解除中のまま止める
    const user = userEvent.setup();
    render(<SecretModeSettingsScreen />);
    await user.click(screen.getByRole('radio', { name: /解除中/ }));
    await user.type(screen.getByLabelText('パスコード'), '1234');
    await user.click(screen.getByRole('button', { name: '解除する' }));
    expect(screen.getByRole('radio', { name: /ロック中/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /解除中/ })).toBeDisabled();
  });
});
