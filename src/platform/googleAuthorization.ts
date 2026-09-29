import { Capacitor, registerPlugin } from '@capacitor/core';

interface GoogleAuthorizationPlugin {
  authorize(options: { serverClientId: string }): Promise<{ code: string; grantedScopes: string[] }>;
}

const GoogleAuthorization = registerPlugin<GoogleAuthorizationPlugin>('GoogleAuthorization');

export function isAndroidGoogleAuthorization(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** 認可コードだけを受け渡す。長期トークンはサーバーだけで扱う。 */
export function authorizeGoogle(serverClientId: string) {
  return GoogleAuthorization.authorize({ serverClientId });
}
