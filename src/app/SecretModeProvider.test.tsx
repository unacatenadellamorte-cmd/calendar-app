import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hashPasscode } from '@/lib/passcode';
import { useSecretMode } from './secret-mode-context';
import { SecretModeProvider } from './SecretModeProvider';

/**
 * `OnlineProvider.test.tsx` と同じ方式: Probe コンポーネントで `useSecretMode()` を読み、
 * 実際のボタン操作(userEvent)経由で unlock/lock/setPasscode を検証する。
 */

function Probe() {
  const { unlocked, hasPasscode, errorKey, unlock, lock, setPasscode, dismissError } =
    useSecretMode();
  return (
    <>
      <span data-testid="unlocked">{String(unlocked)}</span>
      <span data-testid="hasPasscode">{String(hasPasscode)}</span>
      <span data-testid="error">{errorKey ?? ''}</span>
      <button onClick={() => void unlock('1234')}>unlock-1234</button>
      <button onClick={() => void unlock('9999')}>unlock-9999</button>
      <button onClick={lock}>lock</button>
      <button onClick={() => void setPasscode('1234')}>set-1234</button>
      <button onClick={() => void setPasscode('12')}>set-invalid</button>
      <button onClick={dismissError}>dismiss</button>
    </>
  );
}

const onChangePasscodeHash = vi.fn();

function renderProvider(passcodeHash: string | null) {
  return render(
    <SecretModeProvider
      passcodeHash={passcodeHash}
      onChangePasscodeHash={onChangePasscodeHash}
    >
      <Probe />
    </SecretModeProvider>,
  );
}

beforeEach(() => {
  onChangePasscodeHash.mockReset().mockResolvedValue(true);
});

describe('SecretModeProvider', () => {
  it('既定は unlocked=false(ロック中)', () => {
    renderProvider(null);
    expect(screen.getByTestId('unlocked')).toHaveTextContent('false');
  });

  it('passcodeHash が null なら hasPasscode=false', () => {
    renderProvider(null);
    expect(screen.getByTestId('hasPasscode')).toHaveTextContent('false');
  });

  it('passcodeHash が設定済みなら hasPasscode=true', async () => {
    renderProvider(await hashPasscode('1234'));
    expect(screen.getByTestId('hasPasscode')).toHaveTextContent('true');
  });

  it('正しいパスコードで解除すると unlocked=true になる', async () => {
    const user = userEvent.setup();
    renderProvider(await hashPasscode('1234'));
    await user.click(screen.getByText('unlock-1234'));
    expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('誤ったパスコードでは unlocked は変わらずエラーを出す', async () => {
    const user = userEvent.setup();
    renderProvider(await hashPasscode('1234'));
    await user.click(screen.getByText('unlock-9999'));
    expect(screen.getByTestId('unlocked')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('secret/incorrect-passcode');
  });

  it('再ロックはパスコード不要で即座に unlocked=false へ戻す', async () => {
    const user = userEvent.setup();
    renderProvider(await hashPasscode('1234'));
    await user.click(screen.getByText('unlock-1234'));
    expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
    await act(async () => {
      await user.click(screen.getByText('lock'));
    });
    expect(screen.getByTestId('unlocked')).toHaveTextContent('false');
  });

  it('形式不正なパスコードは保存せずエラーを出す', async () => {
    const user = userEvent.setup();
    renderProvider(null);
    await user.click(screen.getByText('set-invalid'));
    expect(screen.getByTestId('error')).toHaveTextContent('secret/invalid-passcode');
    expect(onChangePasscodeHash).not.toHaveBeenCalled();
  });

  it('形式が正しければハッシュ化して onChangePasscodeHash を呼ぶ', async () => {
    const user = userEvent.setup();
    renderProvider(null);
    await user.click(screen.getByText('set-1234'));
    expect(onChangePasscodeHash).toHaveBeenCalledWith(await hashPasscode('1234'));
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('onChangePasscodeHash が false を返したら secret/save-failed をエラーに出す(レビュー指摘)', async () => {
    onChangePasscodeHash.mockResolvedValue(false);
    const user = userEvent.setup();
    renderProvider(null);
    await user.click(screen.getByText('set-1234'));
    expect(screen.getByTestId('error')).toHaveTextContent('secret/save-failed');
  });

  it('dismissError でエラーを消せる', async () => {
    const user = userEvent.setup();
    renderProvider(await hashPasscode('1234'));
    await user.click(screen.getByText('unlock-9999'));
    expect(screen.getByTestId('error')).toHaveTextContent('secret/incorrect-passcode');
    await user.click(screen.getByText('dismiss'));
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('リロード相当(再マウント)では unlocked は必ず false に戻る(永続化しない)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderProvider(await hashPasscode('1234'));
    await user.click(screen.getByText('unlock-1234'));
    expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
    unmount();
    renderProvider(await hashPasscode('1234'));
    expect(screen.getByTestId('unlocked')).toHaveTextContent('false');
  });
});
