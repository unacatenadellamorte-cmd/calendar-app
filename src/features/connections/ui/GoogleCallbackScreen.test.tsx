import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appError, err, ok } from '@/data/result';

const navigate = vi.fn();
const completeGoogleConnect = vi.fn();
let params = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [params],
}));
vi.mock('@/data/connections', () => ({
  completeGoogleConnect: (...a: unknown[]) => completeGoogleConnect(...a),
}));

const { GoogleCallbackScreen } = await import('./GoogleCallbackScreen');

beforeEach(() => {
  vi.useRealTimers();
  navigate.mockReset();
  completeGoogleConnect.mockReset();
  params = new URLSearchParams({ code: 'c', state: 's' });
});

describe('GoogleCallbackScreen', () => {
  it('成功: 受け取ったパラメータで completeGoogleConnect を呼び、設定へ戻る', async () => {
    completeGoogleConnect.mockResolvedValue(ok({ googleEmail: 'me@gmail.com' }));
    render(<GoogleCallbackScreen />);
    expect(await screen.findByText('接続しました')).toBeInTheDocument();
    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
    expect(completeGoogleConnect).toHaveBeenCalledWith(params);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/settings', { replace: true }));
  });

  it('失敗: メッセージと「設定へ戻る」を出し、自動遷移しない', async () => {
    completeGoogleConnect.mockResolvedValue(
      err(appError('connection/state-mismatch', 'connection/state-mismatch')),
    );
    const user = userEvent.setup();
    render(<GoogleCallbackScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('接続を確認できませんでした');
    expect(navigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '設定へ戻る' }));
    expect(navigate).toHaveBeenCalledWith('/settings', { replace: true });
  });

  it('completeGoogleConnect は一度だけ呼ぶ(StrictMode 相当の再実行でも)', async () => {
    completeGoogleConnect.mockResolvedValue(ok({ googleEmail: null }));
    const { rerender } = render(<GoogleCallbackScreen />);
    rerender(<GoogleCallbackScreen />);
    await screen.findByText('接続しました');
    expect(completeGoogleConnect).toHaveBeenCalledTimes(1);
  });
});
