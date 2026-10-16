import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountSection } from './AccountSection';
import { appError, err, ok } from '@/data/result';

const remove = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ state: 'authenticated' }));
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({
    state: auth.state,
    email: '本人@example.invalid',
    signOut: vi.fn(),
    deleteAccount: remove,
  }),
}));
beforeEach(() => {
  auth.state = 'authenticated';
  remove.mockReset();
  remove.mockResolvedValue(ok(undefined));
});

it('説明を読み確認にチェックするまで最終削除を実行できない', async () => {
  render(
    <MemoryRouter>
      <AccountSection />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }));
  expect(remove).not.toHaveBeenCalled();
  expect(
    screen.getByText('Google・端末カレンダーの原本は削除しません。削除は取り消せません。'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '完全に削除する' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '完全に削除する' }));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
});

it('確認をやめた場合は削除を呼ばない', () => {
  render(
    <MemoryRouter>
      <AccountSection />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }));
  fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(remove).not.toHaveBeenCalled();
});

it.each(['authenticated', 'guest'])(
  '%sの削除失敗を表示し、再試行成功でエラーを消す',
  async (state) => {
    auth.state = state;
    let fail!: () => void;
    remove.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fail = () => resolve(err(appError('auth/deletion-failed', 'auth/deletion-failed')));
        }),
    );
    render(
      <MemoryRouter>
        <AccountSection />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }));
    fireEvent.click(screen.getByRole('checkbox'));
    const submit = screen.getByRole('button', { name: '完全に削除する' });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: 'やめる' })).toBeDisabled();
    fireEvent.click(submit);
    expect(remove).toHaveBeenCalledTimes(1);

    await act(async () => fail());
    expect(screen.getByRole('alert')).toHaveTextContent(
      '削除は完了していません。通信を確認して再試行してください。',
    );
    expect(screen.queryByText('アカウントを削除しました')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(submit).toBeEnabled();
    expect(screen.getByRole('button', { name: 'やめる' })).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

it('匿名利用者にも二段確認の削除入口がある', async () => {
  auth.state = 'guest';
  render(
    <MemoryRouter>
      <AccountSection />
    </MemoryRouter>,
  );
  expect(screen.getByText('お試しモードで使っています')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }));
  expect(screen.getByRole('button', { name: '完全に削除する' })).toBeDisabled();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '完全に削除する' }));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
});
