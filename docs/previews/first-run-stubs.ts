import { ok } from '../../src/data/result';

// 専用Vite設定だけで使用する架空のデータ層。実認証・通信・課金は開始しない。
export const env = { hasSupabase: true, hasGoogleOauth: true };
export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const upgradeToPassword = async (email: string) =>
  ok({ status: 'confirmation-pending', email });
export const signUpWithPassword = upgradeToPassword;
export const signInWithPassword = async () => ok({ user: { id: 'preview' } });
let connected = false;
export const listConnections = async () =>
  ok(
    connected
      ? [{ id: 'preview', status: 'active', googleEmail: 'sample@example.invalid' }]
      : [],
  );
export const startGoogleConnect = async () => {
  connected = true;
  return ok({ googleEmail: 'sample@example.invalid' });
};
export const listConnectionCalendars = async () =>
  ok([{ externalCalendarId: 'preview', summary: 'サンプルカレンダー', selected: false }]);
export const refreshGoogleCalendars = async () => ok(undefined);
export const setGoogleCalendarSelected = async () => ok(undefined);
