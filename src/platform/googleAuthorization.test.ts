import { describe, expect, it, vi } from 'vitest';

const { getPlatform, authorize, registerPlugin } = vi.hoisted(() => ({
  getPlatform: vi.fn(), authorize: vi.fn(), registerPlugin: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform },
  registerPlugin: (name: string) => { registerPlugin(name); return { authorize }; },
}));
import { authorizeGoogle, nativeGoogleAuthorizationPlatform } from './googleAuthorization';

describe('Google認可のプラットフォーム判定', () => {
  it.each(['ios', 'android'])('%sではSDKを選択する', (platform) => {
    getPlatform.mockReturnValue(platform);
    expect(nativeGoogleAuthorizationPlatform()).toBe(platform);
  });
  it.each(['web', 'unknown'])('%sではネイティブ認可を選択しない', (platform) => {
    getPlatform.mockReturnValue(platform);
    expect(nativeGoogleAuthorizationPlatform()).toBeNull();
  });
  it('SDKへサーバー用IDを渡し、コードの結果だけを受け取る', async () => {
    authorize.mockResolvedValue({ code: 'code', grantedScopes: [] });
    expect(await authorizeGoogle('server-client')).toEqual({ code: 'code', grantedScopes: [] });
    expect(registerPlugin).toHaveBeenCalledWith('GoogleAuthorization');
    expect(authorize).toHaveBeenCalledWith({ serverClientId: 'server-client' });
  });
});
