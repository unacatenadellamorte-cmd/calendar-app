import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultOnlineState, type OnlineState } from './online-context';

let state: OnlineState;
vi.mock('./online-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./online-context')>();
  return { ...actual, useOnline: () => state };
});

const { ConnectivityBar } = await import('./ConnectivityBar');

const base = (over: Partial<OnlineState> = {}): OnlineState => ({
  ...defaultOnlineState,
  ...over,
});

describe('ConnectivityBar', () => {
  it('オンラインで何も無ければ描画しない', () => {
    state = base({ online: true });
    const { container } = render(<ConnectivityBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('オフラインでバーと未送信件数を出す', () => {
    state = base({ online: false, pendingCount: 2 });
    render(<ConnectivityBar />);
    expect(screen.getByRole('status')).toHaveTextContent('オフライン');
    expect(screen.getByRole('status')).toHaveTextContent('未送信 2 件');
  });

  it('フラッシュ中は「送信中…」', () => {
    state = base({ online: true, flushing: true });
    render(<ConnectivityBar />);
    expect(screen.getByRole('status')).toHaveTextContent('送信中');
  });

  it('syncNotice は alert で出て、閉じるで dismiss を呼ぶ', async () => {
    const dismiss = vi.fn();
    state = base({ online: true, syncNotice: '一部の変更を送信できませんでした', dismissSyncNotice: dismiss });
    const user = userEvent.setup();
    render(<ConnectivityBar />);
    expect(screen.getByRole('alert')).toHaveTextContent('一部の変更を送信できませんでした');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(dismiss).toHaveBeenCalled();
  });
});
