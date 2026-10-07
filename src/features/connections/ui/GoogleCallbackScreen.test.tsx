import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
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
  it('初回の成功は設定ではなく初回フローへ戻り、StrictModeでも交換は一度', async () => {
    completeGoogleConnect.mockResolvedValue(ok({ googleEmail: null }));
    render(
      <StrictMode>
        <GoogleCallbackScreen returnTo="/" />
      </StrictMode>,
    );
    await screen.findByText('接続しました');
    expect(completeGoogleConnect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('初回の拒否はエラーと初回へ戻る導線を出す', async () => {
    completeGoogleConnect.mockResolvedValue(
      err(appError('connection/cancelled', 'connection/cancelled')),
    );
    render(<GoogleCallbackScreen returnTo="/" />);
    await screen.findByRole('alert');
    await userEvent.setup().click(screen.getByRole('button', { name: '初回設定へ戻る' }));
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('交換結果が画面を離れた後に届いても遷移しない', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    completeGoogleConnect.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<GoogleCallbackScreen returnTo="/" />);
    view.unmount();
    await act(async () => finish(ok({ googleEmail: null })));
    act(() => vi.advanceTimersByTime(1000));
    expect(navigate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
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
