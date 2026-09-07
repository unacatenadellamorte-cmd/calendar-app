import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateServiceWorker = vi.fn();
const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();
let sw = {
  needRefresh: [false, setNeedRefresh] as [boolean, typeof setNeedRefresh],
  offlineReady: [false, setOfflineReady] as [boolean, typeof setOfflineReady],
  updateServiceWorker,
};

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => sw }));

const { PwaUpdatePrompt } = await import('./PwaUpdatePrompt');

describe('PwaUpdatePrompt', () => {
  it('更新も offlineReady も無ければ描画しない', () => {
    sw = { ...sw, needRefresh: [false, setNeedRefresh], offlineReady: [false, setOfflineReady] };
    const { container } = render(<PwaUpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('needRefresh で更新バー、「更新」で updateServiceWorker(true)', async () => {
    sw = { ...sw, needRefresh: [true, setNeedRefresh] };
    const user = userEvent.setup();
    render(<PwaUpdatePrompt />);
    expect(screen.getByText('新しいバージョンがあります')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更新' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('offlineReady で告知を出す', () => {
    sw = { ...sw, needRefresh: [false, setNeedRefresh], offlineReady: [true, setOfflineReady] };
    render(<PwaUpdatePrompt />);
    expect(screen.getByText('オフラインでも使えます')).toBeInTheDocument();
  });
});
