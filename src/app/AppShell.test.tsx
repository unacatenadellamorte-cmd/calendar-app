import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * オンボーディング(profiles 行なし)分岐・取得エラー分岐・通常表示 + 上部アバター分岐を検証する。
 * OnlineProvider 配下の実データ層(outbox/sync)はモックせず、fake-indexeddb に任せる
 * (routes.test.tsx と同じ方針)。
 *
 * ここでは `useProfile` をモックして各分岐の条件だけを単体で確認する。
 * 「AppShell / OnboardingScreen / ProfileScreen が同じ状態を共有できているか」
 * (別インスタンス化の回帰)は実フックを使う AppShell.onboarding-flow.test.tsx で確認する。
 */

let authState: 'loading' | 'guest' | 'authenticated' | 'unavailable' = 'guest';
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({ state: authState, session: null, email: null, signOut: vi.fn() }),
}));

const reload = vi.fn();
let profileState: {
  profile: { id: string; displayName: string; avatarDataUrl: string | null } | null;
  loading: boolean;
  errorKey: string | null;
  loadErrorKey: string | null;
} = { profile: null, loading: false, errorKey: null, loadErrorKey: null };
vi.mock('@/features/profile/model/useProfile', () => ({
  useProfile: () => ({
    profile: profileState.profile,
    loading: profileState.loading,
    errorKey: profileState.errorKey,
    loadErrorKey: profileState.loadErrorKey,
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    reload: () => reload(),
    dismissError: vi.fn(),
  }),
}));

const { AppShell } = await import('./AppShell');

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<div>ホーム画面</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState = 'guest';
  profileState = { profile: null, loading: false, errorKey: null, loadErrorKey: null };
  reload.mockReset();
});

describe('AppShell', () => {
  it('profiles 行が無ければオンボーディングを表示し、下タブ・Outlet は出さない', () => {
    renderShell();
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'メインナビゲーション' }),
    ).not.toBeInTheDocument();
  });

  it('profiles 行があれば通常表示 + 上部アバターリンクを出す', () => {
    authState = 'authenticated';
    profileState = {
      profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
      loading: false,
      errorKey: null,
      loadErrorKey: null,
    };
    renderShell();
    expect(screen.getByText('ホーム画面')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'プロフィール' })).toHaveAttribute('href', '/profile');
  });

  it('unavailable なら通常表示のまま、アバターは出さない', () => {
    authState = 'unavailable';
    renderShell();
    expect(screen.getByText('ホーム画面')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'プロフィール' })).not.toBeInTheDocument();
  });

  it('認証未確定(state===loading)の間は待機表示のまま、通常画面は一瞬も出さない', () => {
    authState = 'loading';
    renderShell();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'メインナビゲーション' }),
    ).not.toBeInTheDocument();
  });

  it('プロフィール読み込み中は読み込み中表示、下タブ・オンボーディングは出さない', () => {
    authState = 'guest';
    profileState = { profile: null, loading: true, errorKey: null, loadErrorKey: null };
    renderShell();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'メインナビゲーション' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
  });

  it('プロフィール取得(reload)自体が失敗したら、オンボーディングにはせずエラー+再試行を出す', async () => {
    authState = 'guest';
    profileState = {
      profile: null,
      loading: false,
      errorKey: 'data/query',
      loadErrorKey: 'data/query',
    };
    const user = userEvent.setup();
    renderShell();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '読み込みに失敗しました。もう一度お試しください',
    );
    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'もう一度試す' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
