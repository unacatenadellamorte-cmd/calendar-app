import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useOnline } from './online-context';

const flushOutbox = vi.fn();
const outboxCount = vi.fn();
const subscribeOutbox = vi.fn<(listener: () => void) => () => void>(() => () => {});

vi.mock('@/data/sync', () => ({ flushOutbox: () => flushOutbox() }));
vi.mock('@/data/outbox', () => ({
  outboxCount: () => outboxCount(),
  subscribeOutbox: (listener: () => void) => subscribeOutbox(listener),
}));

const { OnlineProvider } = await import('./OnlineProvider');

function Probe() {
  const { online, syncNonce, pendingCount, syncNotice } = useOnline();
  return (
    <>
      <span data-testid="online">{String(online)}</span>
      <span data-testid="nonce">{syncNonce}</span>
      <span data-testid="pending">{pendingCount}</span>
      <span data-testid="notice">{syncNotice ?? ''}</span>
    </>
  );
}

async function renderProvider() {
  await act(async () => {
    render(
      <OnlineProvider>
        <Probe />
      </OnlineProvider>,
    );
  });
}

beforeEach(() => {
  flushOutbox.mockReset().mockResolvedValue({ flushed: 0, dropped: 0, interrupted: false });
  outboxCount.mockReset().mockResolvedValue(0);
  subscribeOutbox.mockReset().mockReturnValue(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OnlineProvider', () => {
  it('件数取得中に画面を破棄したら、取得後に送信を始めない', async () => {
    let resolveCount!: (count: number) => void;
    outboxCount.mockReturnValue(new Promise<number>((resolve) => { resolveCount = resolve; }));
    const view = render(<OnlineProvider><Probe /></OnlineProvider>);
    view.unmount();
    await act(async () => { resolveCount(1); });
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  it('既定はオンライン。未送信ゼロなら flush しない', async () => {
    await renderProvider();
    expect(screen.getByTestId('online')).toHaveTextContent('true');
    expect(outboxCount).toHaveBeenCalled();
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  it('起動時に未送信があれば flush する', async () => {
    outboxCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValue(0);
    flushOutbox.mockResolvedValue({ flushed: 1, dropped: 0, interrupted: false });
    await renderProvider();
    expect(flushOutbox).toHaveBeenCalled();
    expect(screen.getByTestId('nonce')).toHaveTextContent('1');
  });

  it('offline イベントで online=false、未送信件数を更新する', async () => {
    outboxCount.mockResolvedValue(3);
    await renderProvider();
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('online')).toHaveTextContent('false');
    expect(screen.getByTestId('pending')).toHaveTextContent('3');
  });

  it('online 復帰でフラッシュし、送信できたら syncNonce を進める', async () => {
    await renderProvider();
    outboxCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    flushOutbox.mockResolvedValue({ flushed: 2, dropped: 0, interrupted: false });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('nonce')).toHaveTextContent('1');
  });

  it('フラッシュで項目を破棄したら syncNotice を出す', async () => {
    await renderProvider();
    outboxCount.mockResolvedValue(1);
    flushOutbox.mockResolvedValue({ flushed: 1, dropped: 1, interrupted: false });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('notice')).toHaveTextContent('一部の変更を送信できませんでした');
  });

  it('outbox の追加通知で未送信件数を更新し、オンラインなら再送を始める', async () => {
    let changed!: () => void;
    subscribeOutbox.mockImplementation((listener: () => void) => {
      changed = listener;
      return () => {};
    });
    outboxCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    flushOutbox.mockResolvedValue({ flushed: 1, dropped: 0, interrupted: false });
    await renderProvider();
    await act(async () => changed());
    expect(flushOutbox).toHaveBeenCalled();
    expect(screen.getByTestId('nonce')).toHaveTextContent('1');
  });

  it('flush中にoutboxが増えても多重flushせず、完了後に再件数確認する', async () => {
    vi.useFakeTimers();
    let releaseFlush!: (value: { flushed: number; dropped: number; interrupted: boolean }) => void;
    outboxCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValue(0);
    flushOutbox.mockReturnValue(new Promise((resolve) => { releaseFlush = resolve; }));
    let changed!: () => void;
    subscribeOutbox.mockImplementation((listener: () => void) => {
      changed = listener;
      return () => {};
    });
    const view = render(<OnlineProvider><Probe /></OnlineProvider>);
    await act(async () => {});
    expect(flushOutbox).toHaveBeenCalledTimes(1);
    await act(async () => {
      changed();
      vi.advanceTimersByTime(0);
    });
    expect(flushOutbox).toHaveBeenCalledTimes(1);
    await act(async () => releaseFlush({ flushed: 1, dropped: 0, interrupted: false }));
    view.unmount();
  });

  it('背景中は自動再送せず、前面化後に再送する', async () => {
    const originalVisibility = document.visibilityState;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      outboxCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValue(0);
      const view = render(<OnlineProvider><Probe /></OnlineProvider>);
      await act(async () => {});
      expect(flushOutbox).not.toHaveBeenCalled();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      expect(flushOutbox).toHaveBeenCalledTimes(1);
      view.unmount();
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: originalVisibility });
    }
  });
});
