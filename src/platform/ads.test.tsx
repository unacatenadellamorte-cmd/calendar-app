import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdsPrivacySection } from '@/features/settings/ui/AdsPrivacySection';
import { adsSupported, placeBanner } from './ads';

const sdk = vi.hoisted(() => ({
  platform: 'android',
  requestConsentInfo: vi.fn().mockResolvedValue({ status: 'OBTAINED', canRequestAds: true, isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
  initialize: vi.fn(),
  showBanner: vi.fn(),
  showConsentForm: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => sdk.platform } }));
vi.mock('@capacitor-community/admob', async (original) => ({ ...await original<object>(), AdMob: sdk }));

describe('広告のプライバシー設定への直行', () => {
  it('カレンダーを開かなくても必要な設定ボタンを表示する', async () => {
    sdk.platform = __ADMOB_CONFIG__.platform;
    render(<AdsPrivacySection />);
    expect(await screen.findByRole('button', { name: '広告のプライバシー設定' })).toBeVisible();
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
    expect(sdk.showConsentForm).not.toHaveBeenCalled();
  });
  it('Webとビルド対象が異なるOSでは広告を要求しない', () => {
    const requested = sdk.requestConsentInfo.mock.calls.length;
    for (const platform of ['web', __ADMOB_CONFIG__.platform === 'ios' ? 'android' : 'ios']) {
      sdk.platform = platform;
      expect(adsSupported()).toBe(false);
      placeBanner({ margin: 100, left: 8, width: 320, height: 0, visible: true });
    }
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(requested);
    expect(sdk.showBanner).not.toHaveBeenCalled();
  });
});
