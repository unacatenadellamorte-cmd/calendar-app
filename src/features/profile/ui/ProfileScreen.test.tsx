import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';

/**
 * `profile`/`update` は `AppShell` から `<Outlet context>` 経由で受け取る(レビュー指摘で
 * 画面ごとに別インスタンスの `useProfile` を呼ぶのをやめたため)。実際のルーターと
 * Outletでプロフィール画面へ状態を渡し、表示と戻る操作の結果を検査する。
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
const { ProfileScreen } = await import('./ProfileScreen');

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route element={<Outlet context={outletContext} />}>
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/settings" element={<h1>設定画面</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  update.mockReset();
  authState = 'guest';
  outletContext = { profile: null, loading: false, errorKey: null, update: (p) => update(p) };
});

describe('ProfileScreen', () => {
  it('プロフィールを直接開いた場合も、戻る操作で設定画面に復帰できる', async () => {
    renderProfile();
    await userEvent.click(screen.getByRole('link', { name: '戻る' }));
    expect(screen.getByRole('heading', { name: '設定画面' })).toBeInTheDocument();
  });

  it('既存プロフィールから言語だけを変更でき、名前や写真の更新は呼ばない', async () => {
    outletContext = {
      profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
      loading: false,
      errorKey: null,
      update: (p) => update(p),
    };
    renderProfile();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'en');
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('花子');
    expect(update).not.toHaveBeenCalled();
    expect(localStorage.getItem('calendar-app.language')).toBe('en');
  });
  it('unavailable なら Supabase 未設定の案内を表示する', () => {
    authState = 'unavailable';
    renderProfile();
    expect(screen.getByText(/ローカル開発では認証は無効です/)).toBeInTheDocument();
  });

  it('読み込み中は読み込み中表示', () => {
    outletContext = { profile: null, loading: true, errorKey: null, update: (p) => update(p) };
    renderProfile();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('プロフィールがあれば既存の値でフォームを表示する', () => {
    outletContext = {
      profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
      loading: false,
      errorKey: null,
      update: (p) => update(p),
    };
    renderProfile();
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
    renderProfile();
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
    renderProfile();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '読み込みに失敗しました。もう一度お試しください',
    );
  });
});
