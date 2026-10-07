import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { appError, err, ok } from '@/data/result';
import type { Profile } from '@/data/profiles';
import { Screen } from '@/ui/Screen';
import { TUTORIAL_COMPLETED_KEY } from '@/features/tutorial/model/tutorial-state';
import {
  saveFirstRunStage,
  readFirstRunStage,
} from '@/features/onboarding/model/first-run-state';
import { GoogleCallbackScreen } from '@/features/connections/ui/GoogleCallbackScreen';

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
let userId = 'u1';
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({
    state: authState,
    session: { user: { id: userId } },
    email: null,
    signOut: vi.fn(),
  }),
}));
const authApi = vi.hoisted(() => ({
  upgradeToPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithPassword: vi.fn(),
}));
vi.mock('@/data/auth', () => ({
  ...authApi,
  looksLikeEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
}));
const googleApi = vi.hoisted(() => ({
  listConnections: vi.fn(),
  startGoogleConnect: vi.fn(),
  completeGoogleConnect: vi.fn(),
}));
vi.mock('@/data/connections', () => ({
  ...googleApi,
  GOOGLE_CALLBACK_PATH: '/connections/google/callback',
}));
const calendarApi = vi.hoisted(() => ({
  listConnectionCalendars: vi.fn(),
  refreshGoogleCalendars: vi.fn(),
  setGoogleCalendarSelected: vi.fn(),
}));
vi.mock('@/data/google-calendars', () => calendarApi);
vi.mock('@/data/env', () => ({ env: { hasSupabase: true, hasGoogleOauth: true } }));

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

function ShellRoutes({ initialPath = '/' }: { initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route
            index
            element={
              <Screen title="ホーム画面" showProfileHeader>
                ホーム画面
              </Screen>
            }
          />
          <Route path="profile" element={<ProfileScreen />} />
          <Route
            path="calendar"
            element={
              <Screen title="カレンダー画面" showProfileHeader>
                カレンダー画面
              </Screen>
            }
          />
          <Route path="connections/google/callback" element={<GoogleCallbackScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
function renderShell(initialPath = '/') {
  return render(<ShellRoutes initialPath={initialPath} />);
}

beforeEach(() => {
  localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
  authState = 'guest';
  userId = 'u1';
  getProfile.mockReset();
  createProfile.mockReset();
  updateProfile.mockReset();
  Object.values(authApi).forEach((api) => api.mockReset());
  Object.values(googleApi).forEach((api) => api.mockReset());
  Object.values(calendarApi).forEach((api) => api.mockReset());
  googleApi.listConnections.mockResolvedValue(ok([]));
  calendarApi.listConnectionCalendars.mockResolvedValue(ok([]));
  calendarApi.refreshGoogleCalendars.mockResolvedValue(ok([]));
  calendarApi.setGoogleCalendarSelected.mockResolvedValue(ok(undefined));
});

describe('AppShell × OnboardingScreen(実フック、data層のみモック)', () => {
  it('オンボーディングで送信成功すると、AppShell 自身が profile を認識して通常画面へ切り替わる', async () => {
    authState = 'authenticated';
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

    await user.click(
      await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
    );

    // 最初はオンボーディング(下タブ・ホーム画面は出ない)
    expect(await screen.findByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));

    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'スキップ' }));

    // 別インスタンス問題が直っていれば、AppShell が同じ profile を認識して通常画面に切り替わる
    expect(await screen.findByRole('heading', { name: 'カレンダー画面' })).toBeInTheDocument();
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
    expect(
      await screen.findByRole('heading', { name: 'アカウントを作成' }),
    ).toBeInTheDocument();
  });

  it('登録確認待ち→ログイン→Googleスキップ→名前→案内の順を守り、再起動後に繰り返さない', async () => {
    getProfile.mockResolvedValue(ok(null));
    const created = {
      id: 'u1',
      displayName: '花子',
      avatarDataUrl: null,
      secretPasscodeHash: null,
    };
    createProfile.mockResolvedValue(ok(created));
    authApi.upgradeToPassword.mockResolvedValue(
      ok({ status: 'confirmation-pending', email: 'sample@example.invalid' }),
    );
    authApi.signInWithPassword.mockImplementation(async () => {
      authState = 'authenticated';
      return ok({ user: { id: 'u1' } });
    });
    const user = userEvent.setup();
    const view = renderShell();
    await screen.findByRole('heading', { name: 'アカウントを作成' });
    await user.type(screen.getByLabelText('メールアドレス'), 'sample@example.invalid');
    await user.type(screen.getByLabelText('パスワード(6文字以上)'), 'sample-password');
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(await screen.findByRole('status')).toHaveTextContent('登録はまだ完了していません');
    expect(
      screen.queryByRole('button', { name: 'スキップしてユーザー名を設定' }),
    ).not.toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'ログインへ進む' }));
    await user.type(screen.getByLabelText('パスワード(6文字以上)'), 'sample-password');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));
    // 認証Contextの更新を模擬する。実Providerの購読経路はauth-flow.testで確認する。
    view.rerender(<ShellRoutes />);
    await user.click(
      await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
    );
    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
    expect(readFirstRunStage('u1')).toBe('tutorial');
    for (let page = 0; page < 4; page++)
      await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '使いはじめる' }));
    expect(await screen.findByRole('heading', { name: 'カレンダー画面' })).toBeInTheDocument();
    expect(readFirstRunStage('u1')).toBe('done');
    view.unmount();
    getProfile.mockResolvedValue(ok(created));
    renderShell();
    expect(await screen.findByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
    expect(googleApi.startGoogleConnect).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage })).not.toContain('sample-password');
  });

  it('名前保存の失敗では入力を保持し、成功してからだけ案内へ進む', async () => {
    authState = 'authenticated';
    saveFirstRunStage('u1', 'profile');
    getProfile.mockResolvedValue(ok(null));
    createProfile.mockResolvedValueOnce(err(appError('data/query', 'data/query')));
    createProfile.mockResolvedValueOnce(
      ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
    );
    renderShell();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('名前')).toHaveValue('花子');
    expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
  });

  it('名前保存直後の再起動でも、途中記録から案内だけ再開する', async () => {
    authState = 'authenticated';
    saveFirstRunStage('u1', 'profile');
    getProfile.mockResolvedValue(
      ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
    );
    renderShell();
    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
    expect(screen.queryByLabelText('名前')).not.toBeInTheDocument();
    expect(readFirstRunStage('u1')).toBe('tutorial');
  });

  it('利用者が変わった瞬間に、前の名前入力・進捗を出さない', async () => {
    authState = 'authenticated';
    saveFirstRunStage('u1', 'profile');
    getProfile.mockResolvedValue(ok(null));
    const view = renderShell();
    await userEvent.setup().type(await screen.findByLabelText('名前'), '前の利用者');
    userId = 'u2';
    view.rerender(<ShellRoutes />);
    expect(screen.queryByDisplayValue('前の利用者')).not.toBeInTheDocument();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Googleアカウントを接続（任意）' });
    expect(readFirstRunStage('u2')).toBe('google');
    expect(readFirstRunStage('u1')).toBe('profile');
  });

  it('前の利用者の遅いプロフィール応答を新しい画面へ反映しない', async () => {
    authState = 'authenticated';
    let finish!: (value: unknown) => void;
    getProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    getProfile.mockResolvedValue(ok(null));
    const view = renderShell();
    userId = 'u2';
    view.rerender(<ShellRoutes />);
    await screen.findByRole('heading', { name: 'Googleアカウントを接続（任意）' });
    await act(async () =>
      finish(
        ok({
          id: 'u1',
          displayName: '前の名前',
          avatarDataUrl: null,
          secretPasscodeHash: null,
        }),
      ),
    );
    expect(screen.queryByText('前の名前')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'プロフィール' })).not.toBeInTheDocument();
  });

  it('保存禁止でもGoogleスキップから名前・案内・カレンダーまで進める', async () => {
    authState = 'authenticated';
    getProfile.mockResolvedValue(ok(null));
    createProfile.mockResolvedValue(
      ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
    );
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('保存不可');
    });
    try {
      renderShell();
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
      );
      await user.type(screen.getByLabelText('名前'), '花子');
      await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
      await screen.findByRole('region', { name: '使い方ガイド' });
      await user.click(screen.getByRole('button', { name: 'スキップ' }));
      expect(
        await screen.findByRole('heading', { name: 'カレンダー画面' }),
      ).toBeInTheDocument();
    } finally {
      storage.mockRestore();
    }
  });

  it.each(['sample@example.invalid', null])(
    'ネイティブ成功（メール=%s）から実一覧を再取得し、選択後に名前へ進む',
    async (email) => {
      authState = 'authenticated';
      getProfile.mockResolvedValue(ok(null));
      let finish!: (value: unknown) => void;
      googleApi.startGoogleConnect.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      calendarApi.listConnectionCalendars.mockResolvedValue(
        ok([{ externalCalendarId: 'cal1', summary: 'サンプルカレンダー', selected: false }]),
      );
      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
      expect(screen.queryByText('接続しました')).not.toBeInTheDocument();
      googleApi.listConnections.mockResolvedValue(
        ok([{ id: 'c1', provider: 'google', status: 'active', googleEmail: email }]),
      );
      await act(async () => finish(ok({ googleEmail: email })));
      expect(await screen.findByText('接続しました')).toBeInTheDocument();
      expect(await screen.findByRole('checkbox')).not.toBeChecked();
      await user.click(screen.getByRole('checkbox'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'ユーザー名の設定へ' })).toBeEnabled(),
      );
      await user.click(screen.getByRole('button', { name: 'ユーザー名の設定へ' }));
      expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
      expect(googleApi.startGoogleConnect).toHaveBeenCalledWith();
      expect(readFirstRunStage('u1')).toBe('profile');
    },
  );

  it('接続の応答が遅くてもスキップで名前へ進み、後の成功結果で画面を戻さない', async () => {
    authState = 'authenticated';
    getProfile.mockResolvedValue(ok(null));
    let finish!: (value: unknown) => void;
    googleApi.startGoogleConnect.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderShell();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Google を接続' }));
    await user.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    const reads = googleApi.listConnections.mock.calls.length;
    await act(async () => finish(ok({ googleEmail: null })));
    expect(googleApi.listConnections).toHaveBeenCalledTimes(reads);
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    expect(readFirstRunStage('u1')).toBe('profile');
  });

  it('カレンダー選択の保存中は次へ進めず、失敗を確認してから再試行できる', async () => {
    authState = 'authenticated';
    getProfile.mockResolvedValue(ok(null));
    googleApi.listConnections.mockResolvedValue(
      ok([{ id: 'c1', provider: 'google', status: 'active', googleEmail: null }]),
    );
    calendarApi.listConnectionCalendars.mockResolvedValue(
      ok([{ externalCalendarId: 'cal1', summary: 'サンプルカレンダー', selected: false }]),
    );
    let finish!: (value: unknown) => void;
    calendarApi.setGoogleCalendarSelected.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderShell();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox'));
    const next = screen.getByRole('button', { name: 'ユーザー名の設定へ' });
    expect(next).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }),
    ).toBeDisabled();
    expect(screen.getByText('保存中…')).toBeInTheDocument();
    await user.click(next);
    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
    await act(async () =>
      finish(err(appError('connection/calendars-failed', 'connection/calendars-failed'))),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(next).toBeEnabled();
    calendarApi.setGoogleCalendarSelected.mockResolvedValue(ok(undefined));
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
  });

  it('Web認可復帰をプロフィール取得エラーで遮らず、接続・選択後に名前へ戻る', async () => {
    authState = 'authenticated';
    saveFirstRunStage('u1', 'google');
    getProfile.mockResolvedValueOnce(err(appError('data/query', 'data/query')));
    getProfile.mockResolvedValue(ok(null));
    googleApi.completeGoogleConnect.mockImplementation(async () => {
      googleApi.listConnections.mockResolvedValue(
        ok([
          {
            id: 'c1',
            provider: 'google',
            status: 'active',
            googleEmail: 'sample@example.invalid',
          },
        ]),
      );
      return ok({ googleEmail: 'sample@example.invalid' });
    });
    calendarApi.listConnectionCalendars.mockResolvedValue(
      ok([{ externalCalendarId: 'cal1', summary: 'サンプルカレンダー', selected: false }]),
    );
    renderShell('/connections/google/callback?code=sample&state=sample');
    expect(await screen.findByText('接続しました')).toBeInTheDocument();
    expect(googleApi.completeGoogleConnect).toHaveBeenCalledTimes(1);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'もう一度試す' }, { timeout: 2000 }));
    expect(
      await screen.findByRole('heading', { name: 'Googleアカウントを接続（任意）' }),
    ).toBeInTheDocument();
    const choice = await screen.findByRole('checkbox');
    fireEvent.click(choice);
    await waitFor(() =>
      expect(calendarApi.setGoogleCalendarSelected).toHaveBeenCalledWith('c1', 'cal1', true),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'ユーザー名の設定へ' }));
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    expect(readFirstRunStage('u1')).toBe('profile');
  });
});
