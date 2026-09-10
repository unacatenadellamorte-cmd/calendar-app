import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok } from '@/data/result';

const navigate = vi.fn();
const startGoogleConnect = vi.fn();
const getConnection = vi.fn();
let authState: { state: string } = { state: 'authenticated' };
let envValue = { hasSupabase: true, hasGoogleOauth: true };

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));
vi.mock('@/data/connections', () => ({
  startGoogleConnect: () => startGoogleConnect(),
  getConnection: () => getConnection(),
  GOOGLE_CALLBACK_PATH: '/connections/google/callback',
}));

const { ConnectionsSection } = await import('./ConnectionsSection');

beforeEach(() => {
  navigate.mockReset();
  startGoogleConnect.mockReset();
  getConnection.mockReset().mockResolvedValue(ok(null));
  authState = { state: 'authenticated' };
  envValue = { hasSupabase: true, hasGoogleOauth: true };
});

describe('ConnectionsSection', () => {
  it('authenticated・未接続: 「Google を接続」ボタンで startGoogleConnect を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    const btn = await screen.findByRole('button', { name: 'Google を接続' });
    await user.click(btn);
    expect(startGoogleConnect).toHaveBeenCalledTimes(1);
  });

  it('authenticated・接続済み: email と接続中を表示、ボタンは出さない', async () => {
    getConnection.mockResolvedValue(
      ok({ id: 'c1', provider: 'google', googleEmail: 'me@gmail.com', createdAt: 'x' }),
    );
    render(<ConnectionsSection />);
    expect(await screen.findByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Google に接続中')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google を接続' })).not.toBeInTheDocument();
  });

  it('guest: 「ログインして接続」で /auth へ。Google へは飛ばさない', async () => {
    authState = { state: 'guest' };
    const user = userEvent.setup();
    render(<ConnectionsSection />);
    await user.click(screen.getByRole('button', { name: 'ログインして接続' }));
    expect(navigate).toHaveBeenCalledWith('/auth');
    expect(startGoogleConnect).not.toHaveBeenCalled();
  });

  it('OAuth クライアント ID 未設定: 設定待ちの案内、接続 UI なし', () => {
    envValue = { hasSupabase: true, hasGoogleOauth: false };
    render(<ConnectionsSection />);
    expect(screen.getByText(/まだ設定されていません/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Supabase 未設定: その旨を案内', () => {
    envValue = { hasSupabase: false, hasGoogleOauth: false };
    authState = { state: 'unavailable' };
    render(<ConnectionsSection />);
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
  });

  it('接続状態の取得に失敗したら alert を出す', async () => {
    getConnection.mockResolvedValue({
      ok: false,
      error: { kind: 'data/query', messageKey: 'data/query' },
    });
    render(<ConnectionsSection />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗'));
  });
});
