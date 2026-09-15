import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * `profile`/`update` は `AppShell` から `<Outlet context>` 経由で受け取る(レビュー指摘で
 * 画面ごとに別インスタンスの `useProfile` を呼ぶのをやめたため)。ここでは
 * `react-router-dom` の `useOutletContext` だけを差し替えてテストする。
 */

const update = vi.fn();
let authState: 'guest' | 'authenticated' | 'unavailable' = 'guest';
let outletContext: {
  profile: { id: string; displayName: string; avatarDataUrl: string | null } | null;
  loading: boolean;
  errorKey: string | null;
  update: (patch: unknown) => Promise<boolean>;
} = { profile: null, loading: false, errorKey: null, update: (p) => update(p) };

vi.mock('@/app/auth-context', () => ({ useAuth: () => ({ state: authState }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useOutletContext: () => outletContext };
});

const { ProfileScreen } = await import('./ProfileScreen');

beforeEach(() => {
  update.mockReset();
  authState = 'guest';
  outletContext = { profile: null, loading: false, errorKey: null, update: (p) => update(p) };
});

describe('ProfileScreen', () => {
  it('unavailable なら Supabase 未設定の案内を表示する', () => {
    authState = 'unavailable';
    render(<ProfileScreen />);
    expect(screen.getByText(/ローカル開発では認証は無効です/)).toBeInTheDocument();
  });

  it('読み込み中は読み込み中表示', () => {
    outletContext = { profile: null, loading: true, errorKey: null, update: (p) => update(p) };
    render(<ProfileScreen />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('プロフィールがあれば既存の値でフォームを表示する', () => {
    outletContext = {
      profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
      loading: false,
      errorKey: null,
      update: (p) => update(p),
    };
    render(<ProfileScreen />);
    expect(screen.getByLabelText('名前')).toHaveValue('花子');
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled();
  });

  it('送信すると update を呼ぶ', async () => {
    outletContext = {
      profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
      loading: false,
      errorKey: null,
      update: (p) => update(p),
    };
    update.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ProfileScreen />);
    await user.clear(screen.getByLabelText('名前'));
    await user.type(screen.getByLabelText('名前'), '次郎');
    await user.click(screen.getByRole('button', { name: '保存する' }));
    expect(update).toHaveBeenCalledWith({ displayName: '次郎', avatarDataUrl: null });
  });

  it('errorKey があればエラーを表示する', () => {
    outletContext = {
      profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
      loading: false,
      errorKey: 'data/query',
      update: (p) => update(p),
    };
    render(<ProfileScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗しました。もう一度お試しください');
  });
});
