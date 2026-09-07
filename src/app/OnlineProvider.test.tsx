import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useOnline } from './online-context';

const flushOutbox = vi.fn();
const outboxCount = vi.fn();

vi.mock('@/data/sync', () => ({ flushOutbox: () => flushOutbox() }));
vi.mock('@/data/outbox', () => ({ outboxCount: () => outboxCount() }));

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
});
afterEach(() => vi.unstubAllGlobals());

describe('OnlineProvider', () => {
  it('既定はオンライン。未送信ゼロなら flush しない', async () => {
    await renderProvider();
    expect(screen.getByTestId('online')).toHaveTextContent('true');
    expect(outboxCount).toHaveBeenCalled();
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  it('起動時に未送信があれば flush する', async () => {
    outboxCount.mockResolvedValue(1);
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
    outboxCount.mockResolvedValue(2);
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
});
