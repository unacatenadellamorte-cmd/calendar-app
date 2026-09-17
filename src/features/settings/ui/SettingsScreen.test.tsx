import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/app/AuthProvider';
import { resetFeaturedCountForTests } from '@/features/compact/model/featuredCount';
import { SettingsScreen } from './SettingsScreen';

function renderSettings() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetFeaturedCountForTests();
});

describe('SettingsScreen', () => {
  it('色見本から桜を選んで保存し、再表示後も選択が残る', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSettings();
    await user.click(screen.getByRole('radio', { name: '桜' }));
    expect(window.localStorage.getItem('calendar-app.theme')).toBe('sakura');
    expect(document.documentElement.dataset.theme).toBe('sakura');
    unmount();
    renderSettings();
    expect(screen.getByRole('radio', { name: '桜', checked: true })).toBeInTheDocument();
  });
  it('プロフィール・カレンダー管理・お気に入りシフト・シークレットモードへのリンクがある', () => {
    renderSettings();
    expect(screen.getByRole('link', { name: /プロフィール/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /カレンダー管理/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /お気に入りシフト/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /シークレットモード/ })).toHaveAttribute(
      'href',
      '/secret-mode',
    );
  });

  it('既定は 3 件が選択されている', () => {
    renderSettings();
    expect(screen.getByRole('radio', { name: '3 件', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 件', checked: false })).toBeInTheDocument();
  });

  it('件数を選ぶと選択が変わり localStorage に保存される', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole('radio', { name: '2 件' }));
    expect(screen.getByRole('radio', { name: '2 件', checked: true })).toBeInTheDocument();
    expect(window.localStorage.getItem('calendar-app.featured-count')).toBe('2');
  });
});
