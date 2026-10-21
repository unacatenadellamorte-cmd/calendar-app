import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useSecretMode } from './secret-mode-context';

const lifecycle = vi.hoisted(() => ({ background: undefined as (() => void) | undefined }));
const hashPasscode = vi.hoisted(() => vi.fn());
vi.mock('@/platform/appLifecycle', () => ({
  onAppBackground: (callback: () => void) => {
    lifecycle.background = callback;
    return () => { lifecycle.background = undefined; };
  },
}));
vi.mock('@/lib/passcode', () => ({
  hashPasscode: (...args: unknown[]) => hashPasscode(...args),
  isValidPasscodeFormat: () => true,
}));

const { SecretModeProvider } = await import('./SecretModeProvider');
const Probe = () => {
  const { unlocked, unlock } = useSecretMode();
  return <><span data-testid="unlocked">{String(unlocked)}</span><button onClick={() => void unlock('1234')}>unlock</button></>;
};

beforeEach(() => {
  lifecycle.background = undefined;
  hashPasscode.mockReset();
});

describe('第3群 I1', () => {
  it('解除処理中に背景へ移行したら遅延した解除完了で再解除しない', async () => {
    let resolve!: (value: string) => void;
    hashPasscode.mockImplementation(() => new Promise<string>((r) => { resolve = r; }));
    render(<SecretModeProvider passcodeHash="ok" onChangePasscodeHash={vi.fn()}><Probe /></SecretModeProvider>);
    act(() => { screen.getByRole('button', { name: 'unlock' }).click(); });
    act(() => { lifecycle.background?.(); });
    await act(async () => { resolve('ok'); await Promise.resolve(); });
    expect(screen.getByTestId('unlocked')).toHaveTextContent('false');
  });
});
