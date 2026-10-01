import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { appError, err, ok } from '@/data/result';
import { applyLanguage } from '@/i18n';
import { AuthScreen } from './AuthScreen';

const api = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  upgradeToPassword: vi.fn(),
}));
const auth = vi.hoisted(() => ({ state: 'guest' }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => ({ state: auth.state }) }));
vi.mock('@/data/auth', () => ({
  looksLikeEmail: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  ...api,
}));

beforeEach(() => {
  auth.state = 'guest';
  Object.values(api).forEach((fn) => fn.mockReset());
});

function renderScreen() {
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <Routes>
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/settings" element={<p>設定画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), { target: { value: password } });
}

it('確認待ちは設定へ戻らず、送信先・最新メール・確認後のログインを案内する', async () => {
  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
  renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
  fill('a@b.com', 'secret1');
  fireEvent.click(screen.getByRole('button', { name: '登録する' }));

  const guide = await screen.findByRole('status');
  expect(guide).toHaveTextContent('a@b.com に確認メールを送信しました。登録はまだ完了していません。');
  expect(guide).toHaveTextContent('最新のメール');
  expect(guide).toHaveTextContent('このアプリに戻り、同じメールアドレスとパスワードでログインしてください。');
  expect(screen.queryByText('設定画面')).not.toBeInTheDocument();
  // パスワード欄も値も画面に残さない。再送の操作も置かない。
  expect(document.body.innerHTML).not.toContain('secret1');
  expect(screen.queryByLabelText('パスワード(6文字以上)')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '登録する' })).not.toBeInTheDocument();
});

it('確認待ちからログインへ進み、成功したら従来どおり設定へ戻る', async () => {
  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
  api.signInWithPassword.mockResolvedValue(ok({ user: { id: 'u1' } }));
  renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
  fill('a@b.com', 'secret1');
  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
  fireEvent.click(await screen.findByRole('button', { name: 'ログインへ進む' }));

  expect(screen.getByLabelText('メールアドレス')).toHaveValue('a@b.com');
  expect(screen.getByLabelText('パスワード(6文字以上)')).toHaveValue('');
  fill('a@b.com', 'secret1');
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
  expect(await screen.findByText('設定画面')).toBeInTheDocument();
  expect(api.signInWithPassword).toHaveBeenCalledWith('a@b.com', 'secret1');
});

it('確認待ちから別のメールアドレスでの登録に戻れる', async () => {
  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
  renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
  fill('a@b.com', 'secret1');
  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
  fireEvent.click(await screen.findByRole('button', { name: '別のメールアドレスで登録する' }));

  expect(screen.getByLabelText('メールアドレス')).toHaveValue('');
  expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled();
});

it('即時完了の登録は従来どおり設定へ戻る', async () => {
  api.upgradeToPassword.mockResolvedValue(ok({ status: 'complete' }));
  renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
  fill('a@b.com', 'secret1');
  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
  expect(await screen.findByText('設定画面')).toBeInTheDocument();
});

it.each([
  ['auth/email-rate-limited', '確認メールの送信回数が上限に達しました。届いている最新のメールを確認するか、時間をおいてください'],
  ['auth/email-not-confirmed', 'メールアドレスの確認が完了していません。確認メールのリンクを開いてからログインしてください'],
])('%s はその場で個別の文言を出す', async (key, message) => {
  api.signInWithPassword.mockResolvedValue(err(appError(key, key)));
  renderScreen();
  fill('a@b.com', 'secret1');
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByText('設定画面')).not.toBeInTheDocument();
});

it('送信中は連打とモード変更を受け付けない', async () => {
  let finish!: (value: unknown) => void;
  api.upgradeToPassword.mockReturnValue(new Promise((done) => { finish = done; }));
  renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
  fill('a@b.com', 'secret1');
  const form = screen.getByRole('button', { name: '登録する' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(await screen.findByRole('button', { name: '処理中…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'アカウントを持っている場合はログイン' })).toBeDisabled();
  expect(api.upgradeToPassword).toHaveBeenCalledTimes(1);
  finish(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
  await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
});

it('確認待ちの案内は選択中の言語で出す', async () => {
  applyLanguage('en');
  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
  renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Password (6+ characters)'), { target: { value: 'secret1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'We sent a confirmation email to a@b.com. Registration is not complete yet.',
  );
});
