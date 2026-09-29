import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdsPrivacySection } from '@/features/settings/ui/AdsPrivacySection';

const sdk = vi.hoisted(() => ({
  requestConsentInfo: vi.fn().mockResolvedValue({ status: 'OBTAINED', canRequestAds: true, isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
  initialize: vi.fn(),
  showBanner: vi.fn(),
  showConsentForm: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@capacitor-community/admob', async (original) => ({ ...await original<object>(), AdMob: sdk }));

describe('広告のプライバシー設定への直行', () => {
  it('カレンダーを開かなくても必要な設定ボタンを表示する', async () => {
    render(<AdsPrivacySection />);
    expect(await screen.findByRole('button', { name: '広告のプライバシー設定' })).toBeVisible();
    expect(sdk.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.showBanner).not.toHaveBeenCalled();
    expect(sdk.showConsentForm).not.toHaveBeenCalled();
  });
});
