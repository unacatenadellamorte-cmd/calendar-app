import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { appError, err, ok } from '@/data/result';
import type { Profile } from '@/data/profiles';
import { Screen } from '@/ui/Screen';

/**
 * 回帰テスト(コードレビュー指摘): `AppShell` / `OnboardingScreen` / `ProfileScreen` が
 * それぞれ別インスタンスの `useProfile()` を呼んでいたため、オンボーディングで
 * `create()` が成功しても `AppShell` 側の `profile` が更新されず、ユーザーが
 * 永久にオンボーディング画面へ閉じ込められるバグがあった。
 *
 * `useProfile` フック自体をモックすると（インスタンス分離を再現できず）このバグを
 * 再現できないため、ここでは data 層(`@/data/profiles`)と認証状態だけをモックし、
 * 実際の `useProfile`/`AppShell`/`OnboardingScreen`/`ProfileScreen` を使う。
 */

let authState: 'guest' | 'authenticated' | 'unavailable' = 'guest';
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({ state: authState, session: null, email: null, signOut: vi.fn() }),
}));

const getProfile = vi.fn();
const createProfile = vi.fn();
const updateProfile = vi.fn();
vi.mock('@/data/profiles', () => ({
  getProfile: () => getProfile(),
  createProfile: (i: unknown) => createProfile(i),
  updateProfile: (p: unknown) => updateProfile(p),
}));

const { AppShell } = await import('./AppShell');
const { ProfileScreen } = await import('@/features/profile/ui/ProfileScreen');

function renderShell(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Screen title="ホーム画面" showProfileHeader>ホーム画面</Screen>} />
          <Route path="profile" element={<ProfileScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState = 'guest';
  getProfile.mockReset();
  createProfile.mockReset();
  updateProfile.mockReset();
});

describe('AppShell × OnboardingScreen(実フック、data層のみモック)', () => {
  it('オンボーディングで送信成功すると、AppShell 自身が profile を認識して通常画面へ切り替わる', async () => {
    getProfile.mockResolvedValue(ok(null));
    const created: Profile = {
      id: 'u1',
      displayName: '花子',
      avatarDataUrl: null,
      secretPasscodeHash: null,
    };
    createProfile.mockResolvedValue(ok(created));

    const user = userEvent.setup();
    renderShell();

    // 最初はオンボーディング(下タブ・ホーム画面は出ない)
    expect(await screen.findByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'はじめる' }));

    // 別インスタンス問題が直っていれば、AppShell が同じ profile を認識して通常画面に切り替わる
    expect(await screen.findByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'プロフィール' })).toBeInTheDocument();
  });

  it('ProfileScreen で更新すると、AppShell 上部のアバターに即反映される(別インスタンスなら反映されない)', async () => {
    const existing: Profile = {
      id: 'u1',
      displayName: '花子',
      avatarDataUrl: null,
      secretPasscodeHash: null,
    };
    getProfile.mockResolvedValue(ok(existing));
    const updated: Profile = {
      id: 'u1',
      displayName: '次郎',
      avatarDataUrl: null,
      secretPasscodeHash: null,
    };
    updateProfile.mockResolvedValue(ok(updated));

    const user = userEvent.setup();
    renderShell('/profile');

    const nameInput = await screen.findByLabelText('名前');
    expect(nameInput).toHaveValue('花子');

    await user.clear(nameInput);
    await user.type(nameInput, '次郎');
    await user.click(screen.getByRole('button', { name: '保存する' }));

    // 実際の画面遷移後も AppShell の共通ヘッダーへ更新内容が反映されることを確認する。
    await user.click(screen.getByRole('link', { name: /ホーム/ }));
    expect(await screen.findByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();

    // 上部アバターの頭文字フォールバックが「次」に変わる = AppShell が同じ profile を見ている
    // (ProfileForm 自身のプレビューにも「次」が出るため、上部リンクの中身に絞って確認する)
    const avatarLink = screen.getByRole('link', { name: 'プロフィール' });
    await waitFor(() => expect(within(avatarLink).getByText('次')).toBeInTheDocument());
  });

  it('getProfile が初回取得で失敗したら、既存ユーザーをオンボーディングに閉じ込めず、リトライ導線を出す', async () => {
    getProfile.mockResolvedValueOnce(err(appError('data/query', 'data/query')));
    renderShell();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '読み込みに失敗しました。もう一度お試しください',
    );
    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();

    // 再試行すると、今度は行が無いと分かればオンボーディングへ正しく進める
    getProfile.mockResolvedValueOnce(ok(null));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'もう一度試す' }));
    expect(await screen.findByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
  });
});
