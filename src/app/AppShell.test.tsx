import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Screen } from '@/ui/Screen';

/**
 * オンボーディング(profiles 行なし)分岐・取得エラー分岐・通常表示 + 上部アバター分岐を検証する。
 * OnlineProvider 配下の実データ層(outbox/sync)はモックせず、fake-indexeddb に任せる
 * (routes.test.tsx と同じ方針)。
 *
 * ここでは `useProfile` をモックして各分岐の条件だけを単体で確認する。
 * 「AppShell / OnboardingScreen / ProfileScreen が同じ状態を共有できているか」
 * (別インスタンス化の回帰)は実フックを使う AppShell.onboarding-flow.test.tsx で確認する。
 *
 * アバターのタップ判定(spec-secret-mode-avatar-toggle)は `useSecretMode` もモックして、
 * `AvatarNav` の分岐(3パターン)とタイマーの単発/ダブル判定だけを単体で確認する。
 * `SecretModeProvider` 自体のハッシュ照合ロジックは `SecretModeProvider.test.tsx` の対象。
 * ただし1本だけ(`useRealSecretMode` フラグ)は `useSecretMode` をモックせず、実際の
 * `SecretModeProvider` から `AvatarNav` が正しく状態を読めているか(= `SecretModeProvider`
 * の外でレンダーされる回帰が無いか)を確認する(レビュー指摘)。
 */

let authState: 'loading' | 'guest' | 'authenticated' | 'unavailable' = 'guest';
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({ state: authState, session: null, email: null, signOut: vi.fn() }),
}));

const reload = vi.fn();
let profileState: {
  profile: {
    id: string;
    displayName: string;
    avatarDataUrl: string | null;
    secretPasscodeHash?: string | null;
  } | null;
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

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

let secretState: {
  unlocked: boolean;
  hasPasscode: boolean;
  errorKey: string | null;
  unlock: ReturnType<typeof vi.fn>;
  lock: ReturnType<typeof vi.fn>;
  setPasscode: ReturnType<typeof vi.fn>;
  dismissError: ReturnType<typeof vi.fn>;
};
// 1本だけ(実 SecretModeProvider 配線の回帰テスト)は true にして、モックではなく本物の
// useContext(SecretModeContext) を通す(レビュー指摘)。
let useRealSecretMode = false;
vi.mock('./secret-mode-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./secret-mode-context')>();
  return {
    ...actual,
    useSecretMode: () => (useRealSecretMode ? actual.useSecretMode() : secretState),
  };
});

const { AppShell } = await import('./AppShell');

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Screen title="ホーム画面" showProfileHeader>ホーム画面</Screen>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState = 'guest';
  profileState = { profile: null, loading: false, errorKey: null, loadErrorKey: null };
  reload.mockReset();
  navigateMock.mockReset();
  useRealSecretMode = false;
  secretState = {
    unlocked: false,
    hasPasscode: false,
    errorKey: null,
    unlock: vi.fn().mockResolvedValue(true),
    lock: vi.fn(),
    setPasscode: vi.fn().mockResolvedValue(true),
    dismissError: vi.fn(),
  };
});

afterEach(() => {
  // タイマーを使うテストが実タイマーへ漏れないよう、毎回必ず戻す(DeepLinkListener.test.tsx と同じ)。
  vi.useRealTimers();
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
    expect(screen.getByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'プロフィール' })).toBeInTheDocument();
  });

  it('unavailable なら通常表示のまま、アバターは出さない', () => {
    authState = 'unavailable';
    renderShell();
    expect(screen.getByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
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

  describe('上部アバターのシングル/ダブルタップ判定', () => {
    beforeEach(() => {
      authState = 'authenticated';
      profileState = {
        profile: { id: 'u1', displayName: '花子', avatarDataUrl: null },
        loading: false,
        errorKey: null,
        loadErrorKey: null,
      };
    });

    it('シングルタップのみ(300ms以内に2回目無し)なら約300ms後に /profile へ遷移する', () => {
      vi.useFakeTimers();
      renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      expect(navigateMock).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/profile');
    });

    it('300ms以内に2回タップ かつ パスコード未設定なら /secret-mode へ遷移し、/profile へは遷移しない', () => {
      secretState.hasPasscode = false;
      vi.useFakeTimers();
      renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      fireEvent.click(avatar);

      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/secret-mode');
      expect(secretState.lock).not.toHaveBeenCalled();

      // 止めたはずのシングルタップ用タイマーが後から発火して /profile へ飛ばさないことを確認する。
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });

    it('300ms以内に2回タップ かつ 解除中なら、即座に再ロックしシートは開かない', () => {
      secretState.hasPasscode = true;
      secretState.unlocked = true;
      vi.useFakeTimers();
      renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      fireEvent.click(avatar);

      expect(secretState.lock).toHaveBeenCalledTimes(1);
      expect(navigateMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'シークレットモードを解除' })).not.toBeInTheDocument();
    });

    it('300ms以内に2回タップ かつ ロック中・パスコード設定済みなら、クイック解除シートが開く', () => {
      secretState.hasPasscode = true;
      secretState.unlocked = false;
      vi.useFakeTimers();
      renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      fireEvent.click(avatar);

      expect(screen.getByRole('dialog', { name: 'シークレットモードを解除' })).toBeInTheDocument();
      expect(secretState.lock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('アンマウント時に保留中のシングルタップタイマーを止める(遷移しない)', () => {
      vi.useFakeTimers();
      const { unmount } = renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      unmount();

      expect(() => {
        act(() => {
          vi.advanceTimersByTime(300);
        });
      }).not.toThrow();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('300ms以内に3回連続タップしても、ダブルタップ確定直後のクールダウン中の3回目は無視し /profile へ遷移しない(レビュー指摘)', () => {
      secretState.hasPasscode = false;
      vi.useFakeTimers();
      renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      fireEvent.click(avatar); // ここでダブルタップ確定 → /secret-mode へ1回だけ navigate
      fireEvent.click(avatar); // クールダウン中の3回目。新しい「1回目のタップ」として扱わない

      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/secret-mode');

      // クールダウンが明けても、3回目のタップがタイマーを仕掛けていなければこれ以上 navigate は呼ばれない。
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });

    it('（実 SecretModeProvider 配線)useSecretMode をモックせず、AvatarNav が実際の Context から状態を読んでダブルタップでクイック解除シートを開く', () => {
      useRealSecretMode = true;
      profileState = {
        profile: {
          id: 'u1',
          displayName: '花子',
          avatarDataUrl: null,
          secretPasscodeHash: 'dummy-hash',
        },
        loading: false,
        errorKey: null,
        loadErrorKey: null,
      };
      vi.useFakeTimers();
      renderShell();
      const avatar = screen.getByRole('link', { name: 'プロフィール' });

      fireEvent.click(avatar);
      fireEvent.click(avatar);

      // secretPasscodeHash が非 null(hasPasscode=true)・unlocked=false(既定)という実際の
      // SecretModeProvider の Context 値どおりにクイック解除シートが開けば、AvatarNav が
      // SecretModeProvider の配下で正しく useSecretMode() を読めている証拠になる。
      expect(screen.getByRole('dialog', { name: 'シークレットモードを解除' })).toBeInTheDocument();
    });
  });
});
