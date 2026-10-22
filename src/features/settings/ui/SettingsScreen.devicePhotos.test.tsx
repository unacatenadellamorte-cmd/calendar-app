// 写真の権利は利用者ごとに切り替えるため可変のfixtureにする。既定は有効な契約。
const entitlement = vi.hoisted(() => ({ canViewPhotos: true, loading: false }));
vi.mock('@/features/billing/model/useEntitlements', () => ({ useEntitlements: () => ({ ...entitlement }) }));
// 課金境界は「写真のプラン案内を開く要求」だけを確認する最小mock。購入SDKや認証は使わない。
const planSheet = vi.hoisted(() => ({ last: undefined as undefined | { open: boolean; reason: string } }));
vi.mock('@/features/billing/ui/PlanSheet', () => ({
  PlanSheet: (props: { open: boolean; reason: string }) => {
    if (props.open) planSheet.last = props;
    return null;
  },
}));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// 有効な写真契約を前提に、OSとの境界を模擬する。設定画面・設定ストアは本物を使う。
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
  entitlement.canViewPhotos = true;
  entitlement.loading = false;
  planSheet.last = undefined;
});

describe('SettingsScreen の端末写真スイッチ', () => {
  it('保存ONのまま写真の権利がなくなっても、OFFに戻して保存できる(案内は開かない)', async () => {
    window.localStorage.setItem('calendar-app.device-photos-enabled', 'true');
    resetDevicePhotosEnabledForTests();
    entitlement.canViewPhotos = false;
    const user = userEvent.setup();
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('calendar-app.device-photos-enabled')).toBe('false');
    expect(planSheet.last).toBeUndefined();
  });

  it('権利を確認中は保存OFFからのONを抑止し、保存ONならOFFに戻せる', async () => {
    entitlement.loading = true;
    entitlement.canViewPhotos = false;
    const user = userEvent.setup();
    const off = renderSettings();
    expect(screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' })).toBeDisabled();
    off.unmount();

    window.localStorage.setItem('calendar-app.device-photos-enabled', 'true');
    resetDevicePhotosEnabledForTests();
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('calendar-app.device-photos-enabled')).toBe('false');
    expect(planSheet.last).toBeUndefined();
  });

  it('写真の権利がない本人がONにしても保存せず、写真プランの案内を開き、OS APIは呼ばない', async () => {
    entitlement.canViewPhotos = false;
    const user = userEvent.setup();
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'カレンダーに端末の写真を表示' });
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('calendar-app.device-photos-enabled')).not.toBe('true');
    expect(planSheet.last).toMatchObject({ open: true, reason: 'photos' });
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.listAssets).not.toHaveBeenCalled();
  });

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
