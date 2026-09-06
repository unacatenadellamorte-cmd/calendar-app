import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/routes';
import { AuthProvider } from '@/app/AuthProvider';

// テスト環境では VITE_SUPABASE_URL が無いため AuthProvider は即 'unavailable'(非同期なし)。
function renderApp(initialPath = '/') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('AppShell', () => {
  it('下タブ3つを描画し、既定はホーム画面', () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('ホーム'),
      expect.stringContaining('カレンダー'),
      expect.stringContaining('設定'),
    ]);
    expect(screen.getByRole('heading', { level: 1, name: '今日' })).toBeInTheDocument();
  });

  it('タブをクリックするとルートが変わる', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(screen.getByRole('link', { name: /カレンダー/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'カレンダー' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /設定/ }));
    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument();
  });

  it('設定画面でテーマを切り替えると data-theme が変わり、localStorage に保存される', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(screen.getByRole('radio', { name: 'ダーク' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('calendar-app.theme')).toBe('dark');

    await user.click(screen.getByRole('radio', { name: '端末に合わせる' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem('calendar-app.theme')).toBe('system');
  });
});
