import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { appError, err, ok } from '@/data/result';
import { applyLanguage, languages } from '@/i18n';
import { GoogleSetupScreen } from './GoogleSetupScreen';

const api = vi.hoisted(() => ({ start: vi.fn(), refresh: vi.fn(), available: true }));
let connectionState = {
  connections: [] as {
    id: string;
    status: 'active' | 'suspended';
    googleEmail: string | null;
  }[],
  loading: false,
  errorKey: null as string | null,
};
vi.mock('@/data/env', () => ({
  env: {
    get hasSupabase() {
      return api.available;
    },
    get hasGoogleOauth() {
      return api.available;
    },
  },
}));
vi.mock('@/data/connections', () => ({ startGoogleConnect: () => api.start() }));
vi.mock('@/features/connections/model/useGoogleConnections', () => ({
  useGoogleConnections: () => ({ ...connectionState, refresh: api.refresh }),
}));
vi.mock('@/features/connections/ui/GoogleCalendarPicker', () => ({
  GoogleAccountCalendars: ({ email }: { email: string }) => <p>{email}（カレンダー選択）</p>,
}));

beforeEach(() => {
  connectionState = { connections: [], loading: false, errorKey: null };
  api.start.mockReset();
  api.refresh.mockReset();
  api.available = true;
});

it('未接続では接続かスキップを選べ、購入や書込許可を開始しない', () => {
  const next = vi.fn();
  render(<GoogleSetupScreen onContinue={next} />);
  expect(screen.getByRole('button', { name: 'Google を接続' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
  expect(next).toHaveBeenCalledTimes(1);
  expect(api.start).not.toHaveBeenCalled();
});

it('ネイティブ接続成功は一覧再取得まで接続済みとせず、連打を防ぎ接続中もスキップできる', async () => {
  let finish!: (value: unknown) => void;
  api.start.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const next = vi.fn();
  render(<GoogleSetupScreen onContinue={next} />);
  fireEvent.click(screen.getByRole('button', { name: 'Google を接続' }));
  const skip = screen.getByRole('button', { name: 'スキップしてユーザー名を設定' });
  expect(skip).toBeEnabled();
  fireEvent.click(skip);
  expect(next).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '接続を確認しています…' }));
  expect(api.start).toHaveBeenCalledTimes(1);
  await act(async () => finish(ok({ googleEmail: 'sample@example.invalid' })));
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('接続しました')).not.toBeInTheDocument();
});

it('拒否されたらメッセージを出し、スキップで先へ進める', async () => {
  api.start.mockResolvedValue(err(appError('connection/cancelled', 'connection/cancelled')));
  const next = vi.fn();
  render(<GoogleSetupScreen onContinue={next} />);
  fireEvent.click(screen.getByRole('button', { name: 'Google を接続' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('キャンセル');
  fireEvent.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
  expect(next).toHaveBeenCalledTimes(1);
});

it.each(['loading', 'error', 'unavailable', 'suspended'] as const)(
  '%sを接続成功扱いせず、明示スキップは可能',
  (kind) => {
    if (kind === 'loading') connectionState.loading = true;
    if (kind === 'error') connectionState.errorKey = 'data/query';
    if (kind === 'unavailable') api.available = false;
    if (kind === 'suspended')
      connectionState.connections = [
        { id: 'c', status: 'suspended', googleEmail: 'sample@example.invalid' },
      ];
    const next = vi.fn();
    render(<GoogleSetupScreen onContinue={next} />);
    expect(screen.queryByText('接続しました')).not.toBeInTheDocument();
    if (kind === 'error') {
      fireEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
      expect(api.refresh).toHaveBeenCalledTimes(1);
    }
    fireEvent.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
    expect(next).toHaveBeenCalledTimes(1);
  },
);

it('確認済みactiveだけを表示し、選択なしでも名前へ進める', () => {
  connectionState.connections = [
    { id: 'c', status: 'active', googleEmail: 'sample@example.invalid' },
  ];
  const next = vi.fn();
  render(<GoogleSetupScreen onContinue={next} />);
  expect(screen.getByText('接続しました')).toBeInTheDocument();
  expect(screen.getByText(/sample@example.invalid/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ユーザー名の設定へ' }));
  expect(next).toHaveBeenCalledTimes(1);
});

it('画面を離れた後の接続結果で再取得・遷移しない', async () => {
  let finish!: (value: unknown) => void;
  api.start.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { unmount } = render(<GoogleSetupScreen onContinue={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Google を接続' }));
  unmount();
  await act(async () => finish(ok({ googleEmail: null })));
  expect(api.refresh).not.toHaveBeenCalled();
});

it.each(languages.filter(({ code }) => code !== 'ja'))(
  '$nameの初回Google案内を翻訳する',
  ({ code }) => {
    applyLanguage(code);
    const { container, unmount } = render(<GoogleSetupScreen onContinue={vi.fn()} />);
    expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ]/);
    unmount();
    applyLanguage('ja');
  },
);

it.each(languages.filter(({ code }) => code !== 'ja'))(
  '$nameの接続処理中にも日本語を残さない',
  async ({ code }) => {
    applyLanguage(code);
    let finish!: (value: unknown) => void;
    api.start.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { container, unmount } = render(<GoogleSetupScreen onContinue={vi.fn()} />);
    fireEvent.click(container.querySelector('button')!);
    expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ]/);
    unmount();
    await act(async () => finish(ok({ googleEmail: null })));
    applyLanguage('ja');
  },
);
