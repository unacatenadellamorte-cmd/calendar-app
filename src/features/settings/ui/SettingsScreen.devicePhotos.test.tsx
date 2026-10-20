import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// 模擬するのは OS との境界(Capacitor のネイティブ橋)だけ。設定画面・設定ストアは本物を使う。
const platform = vi.hoisted(() => ({ native: true }));
const nativePlugin = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  listAssets: vi.fn(),
  loadImage: vi.fn(),
  cancelLoads: vi.fn(async () => {}),
  cancelLoad: vi.fn(async () => {}),
  manageLimitedAccess: vi.fn(),
}));
vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => (platform.native ? 'ios' : 'web'),
  },
  registerPlugin: (name: string) => (name === 'DevicePhotos' ? nativePlugin : {}),
}));
vi.mock('@/data/auth', async (original) => ({
  ...(await original<typeof import('@/data/auth')>()),
  isAuthAvailable: () => false,
}));

import { AuthProvider } from '@/app/AuthProvider';
import { resetDevicePhotosEnabledForTests } from '@/features/settings/model/useDevicePhotosEnabled';
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
  platform.native = true;
  window.localStorage.clear();
  resetDevicePhotosEnabledForTests();
  vi.clearAllMocks();
});

describe('SettingsScreen の端末写真スイッチ', () => {
  it('既定はOFFで、OS権限の撤回とは別機能だと説明し、操作しても写真APIは呼ばない', async () => {
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/OSの写真アクセス権限の撤回とは別/)).toBeInTheDocument();
    await userEvent.setup().click(toggle);
    expect(toggle).toBeChecked();
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
  });

  it('ONの真偽値だけを端末内へ保存し、再表示後も保持し、OFFに戻すと読込を解放する', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSettings();
    await user.click(screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' }));
    expect(window.localStorage.getItem('calendar-app.device-photos-enabled')).toBe('true');
    unmount();
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' });
    expect(toggle).toBeChecked();
    nativePlugin.cancelLoads.mockClear();
    await user.click(toggle);
    expect(window.localStorage.getItem('calendar-app.device-photos-enabled')).toBe('false');
    expect(nativePlugin.cancelLoads).toHaveBeenCalled();
  });

  it('Webでは写真機能が非対応なので、スイッチを出さない', () => {
    platform.native = false;
    renderSettings();
    expect(
      screen.queryByRole('switch', { name: 'カレンダーに端末の写真を表示' }),
    ).not.toBeInTheDocument();
  });
});
