import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 模擬するのは OS との境界(Capacitor のネイティブ橋)だけ。パネル・写真欄・設定は本物を使う。
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
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  registerPlugin: (name: string) => (name === 'DevicePhotos' ? nativePlugin : {}),
}));

import {
  DEVICE_PHOTOS_ENABLED_STORAGE_KEY,
  resetDevicePhotosEnabledForTests,
} from '@/features/settings/model/useDevicePhotosEnabled';
import { DayEventPanel } from './DayEventPanel';
import { WeekView } from './WeekView';

function renderPanel(photosSuspended = false) {
  return (
    <DayEventPanel
      date="2026-10-20"
      byDay={new Map()}
      calendarById={new Map()}
      onEventTap={vi.fn()}
      onAddEvent={vi.fn()}
      photosSuspended={photosSuspended}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetDevicePhotosEnabledForTests();
  vi.clearAllMocks();
  nativePlugin.checkPermission.mockResolvedValue({ status: 'granted' });
  nativePlugin.listAssets.mockResolvedValue({
    assets: [{ id: 'a', createdMs: Date.UTC(2026, 9, 20, 0, 5) }],
    hasMore: false,
  });
  nativePlugin.loadImage.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,a' });
});

describe('DayEventPanel の写真欄', () => {
  it('日表示でも選択した日の写真欄を折りたたんで表示する', () => {
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    resetDevicePhotosEnabledForTests();
    render(<WeekView cursor="2026-10-20" today="2026-10-20" events={[]} calendarById={new Map()} onSlotTap={vi.fn()} onEventTap={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'この日の写真' })).toHaveAttribute('aria-expanded', 'false');
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
  });
  it('設定OFFなら写真欄を出さず、予定の追加は引き続き操作できる', async () => {
    render(renderPanel());
    expect(screen.queryByRole('button', { name: 'この日の写真' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ この日に予定を追加' })).toBeEnabled();
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
  });

  it('設定ONなら予定一覧の下に折りたたんだ写真欄を出し、開くまで読まない', () => {
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    resetDevicePhotosEnabledForTests();
    render(renderPanel());
    const add = screen.getByRole('button', { name: '＋ この日に予定を追加' });
    const photos = screen.getByRole('button', { name: 'この日の写真' });
    expect(add.compareDocumentPosition(photos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(photos).toHaveAttribute('aria-expanded', 'false');
    expect(nativePlugin.checkPermission).not.toHaveBeenCalled();
  });

  it('予定の入力・詳細シートが開く間は拡大表示を閉じ、レイヤーを重ねない', async () => {
    window.localStorage.setItem(DEVICE_PHOTOS_ENABLED_STORAGE_KEY, 'true');
    resetDevicePhotosEnabledForTests();
    const user = userEvent.setup();
    const { rerender } = render(renderPanel());
    await user.click(screen.getByRole('button', { name: 'この日の写真' }));
    await user.click(await screen.findByRole('button', { name: '9:05 の写真を拡大' }));
    expect(await screen.findByRole('dialog', { name: '写真' })).toBeInTheDocument();
    rerender(renderPanel(true));
    expect(screen.queryByRole('dialog', { name: '写真' })).not.toBeInTheDocument();
  });
});
