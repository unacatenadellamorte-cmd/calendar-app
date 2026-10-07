import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ok } from '@/data/result';
import type { Session } from '@supabase/supabase-js';
import { readFirstRunStage } from '@/features/onboarding/model/first-run-state';

const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  signin: vi.fn(),
}));
let publish: (session: Session | null) => void;
const guest = { user: { id: 'u1', is_anonymous: true } } as Session;
const account = {
  user: {
    id: 'u1',
    is_anonymous: false,
    email: 'sample@example.invalid',
    email_confirmed_at: '2026-10-07T00:00:00Z',
  },
} as Session;

vi.mock('@/data/auth', () => ({
  isAuthAvailable: () => true,
  getSession: async () => ok(guest),
  signInAnonymously: async () => ok(guest),
  onAuthStateChange: (listener: typeof publish) => {
    publish = listener;
    return { unsubscribe: vi.fn() };
  },
  looksLikeEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  upgradeToPassword: async () =>
    ok({ status: 'confirmation-pending', email: 'sample@example.invalid' }),
  signUpWithPassword: vi.fn(),
  signInWithPassword: (...args: unknown[]) => api.signin(...args),
  signOut: vi.fn(),
  deleteMyAccount: vi.fn(),
}));
vi.mock('@/data/profiles', () => ({
  getProfile: () => api.getProfile(),
  createProfile: (value: unknown) => api.createProfile(value),
  updateProfile: vi.fn(),
}));
vi.mock('@/data/env', () => ({ env: { hasSupabase: true, hasGoogleOauth: false } }));
const { AuthProvider } = await import('./AuthProvider');
const { AppShell } = await import('./AppShell');
const { AuthScreen } = await import('@/features/auth/ui/AuthScreen');

it('通常ログインで別IDの認証通知が応答より先でも、再マウント後は設定へ戻る', async () => {
  const nextAccount = { ...account, user: { ...account.user, id: 'u2' } } as Session;
  api.getProfile
    .mockResolvedValueOnce(
      ok({ id: 'u1', displayName: 'ゲスト', avatarDataUrl: null, secretPasscodeHash: null }),
    )
    .mockResolvedValue(
      ok({ id: 'u2', displayName: '登録済み', avatarDataUrl: null, secretPasscodeHash: null }),
    );
  let finish!: (value: unknown) => void;
  api.signin.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route path="auth" element={<AuthScreen />} />
            <Route path="settings" element={<h1>設定画面</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await screen.findByRole('heading', { name: 'ログイン' });
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'sample@example.invalid' },
  });
  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), {
    target: { value: 'sample-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
  await act(async () => publish(nextAccount));
  expect(await screen.findByRole('heading', { name: '設定画面' })).toBeInTheDocument();
  await act(async () => finish(ok(nextAccount)));
  expect(screen.queryByRole('heading', { name: 'ログイン' })).not.toBeInTheDocument();
});

it('実AuthProviderの認証通知から、同一ID昇格→Googleスキップ→名前→案内へ進む', async () => {
  api.getProfile.mockResolvedValue(ok(null));
  api.createProfile.mockResolvedValue(
    ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
  );
  api.signin.mockImplementation(async () => {
    publish(account);
    return ok(account);
  });
  render(
    <AuthProvider>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<p>通常画面</p>} />
            <Route path="calendar" element={<h1>カレンダー画面</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  await screen.findByRole('heading', { name: 'アカウントを作成' });
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'sample@example.invalid' },
  });
  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), {
    target: { value: 'sample-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
  expect(await screen.findByRole('status')).toHaveTextContent('登録はまだ完了していません');
  expect(
    screen.queryByRole('button', { name: 'スキップしてユーザー名を設定' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ログインへ進む' }));
  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), {
    target: { value: 'sample-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
  );
  await user.type(screen.getByLabelText('名前'), '花子');
  await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
  expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
  expect(readFirstRunStage('u1')).toBe('tutorial');
  await user.click(screen.getByRole('button', { name: 'スキップ' }));
  expect(await screen.findByRole('heading', { name: 'カレンダー画面' })).toBeInTheDocument();
  expect(readFirstRunStage('u1')).toBe('done');
});
