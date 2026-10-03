import { Capacitor, registerPlugin } from '@capacitor/core';

interface GoogleAuthorizationPlugin {
  authorize(options: { serverClientId: string; write?: boolean }): Promise<{ code: string; grantedScopes: string[] }>;
}

const GoogleAuthorization = registerPlugin<GoogleAuthorizationPlugin>('GoogleAuthorization');

export function nativeGoogleAuthorizationPlatform(): 'android' | 'ios' | null {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

/** 認可コードだけを受け渡す。長期トークンはサーバーだけで扱う。 */
export function authorizeGoogle(serverClientId: string, write = false) {
  return GoogleAuthorization.authorize(write ? { serverClientId, write: true } : { serverClientId });
}
