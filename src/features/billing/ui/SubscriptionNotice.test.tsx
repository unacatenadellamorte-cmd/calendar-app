import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubscriptionNotice } from './SubscriptionNotice';
import { PlanSheet } from './PlanSheet';
import { AccountSection } from '@/features/settings/ui/AccountSection';

let platform = 'ios';
const openExternalUrl = vi.fn();
vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => platform } };
});
vi.mock('@/platform/externalLinks', () => ({
  openExternalUrl: (url: string) => openExternalUrl(url),
}));
vi.mock('@/app/auth-context', () => ({
  useAuth: () => ({ state: 'guest', session: null, email: null }),
}));
beforeEach(() => {
  platform = 'ios';
  openExternalUrl.mockReset().mockResolvedValue(true);
});

describe('ストア管理の導線', () => {
  it.each(['ios', 'android', 'web'])('%sのストアだけを案内する（Webは両方）', (os) => {
    platform = os;
    render(<SubscriptionNotice />);
    const apple = screen.queryByRole('button', { name: 'App Storeで定期購入を管理' });
    const google = screen.queryByRole('button', { name: 'Google Playで定期購入を管理' });
    expect(Boolean(apple)).toBe(os !== 'android');
    expect(Boolean(google)).toBe(os !== 'ios');
    if (apple) {
      fireEvent.click(apple);
      expect(openExternalUrl).toHaveBeenCalledWith(
        'https://apps.apple.com/account/subscriptions',
      );
    }
    if (google) {
      fireEvent.click(google);
      expect(openExternalUrl).toHaveBeenCalledWith(
        'https://play.google.com/store/account/subscriptions',
      );
    }
  });

  it('iOSのプラン画面と削除確認にも他ストアを出さない', () => {
    const sheet = render(<PlanSheet open reason="settings" onClose={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'App Storeで定期購入を管理' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Google Play/)).not.toBeInTheDocument();
    sheet.unmount();
    render(
      <MemoryRouter>
        <AccountSection />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }));
    expect(
      screen.getByRole('button', { name: 'App Storeで定期購入を管理' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Google Play/)).not.toBeInTheDocument();
    expect(screen.getByText(/Googleへ送った予定/)).toBeInTheDocument();
  });

  it('利用条件は同期の無料範囲と写真表示の期限切れ後の扱いを説明し、再購入を求めない', () => {
    render(<SubscriptionNotice />);
    expect(
      screen.getByText(
        'Google アカウント1件の同期と予定反映は無料で利用できます。複数アカウントプランは最大5件まで接続でき、写真表示を含みます。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '写真表示は有料プランの有効期間中のみ利用できます。期限切れ後は写真を表示せず、有効な契約の確認後に再開できます。返金・解約の条件は購入したストアの規定に従います。',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/再購入/)).not.toBeInTheDocument();
  });
});
