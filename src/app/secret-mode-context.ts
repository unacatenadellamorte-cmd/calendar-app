import { createContext, useContext } from 'react';

/**
 * シークレットモードの解除状態(spec-secret-mode)。`online-context.ts` と同型の
 * React Context: HomeScreen/CalendarScreen/設定画面から Outlet 越しでなく直接
 * `useSecretMode()` で読める(`OnlineProvider`/`useOnline` と同じ理由)。
 * Provider は `SecretModeProvider.tsx`(react-refresh のため hook / component を分離)。
 */

export interface SecretModeState {
  /** 解除中か。メモリ上の state のみで永続化しない(リロードで必ず false に戻る)。 */
  unlocked: boolean;
  /** パスコードが設定済みか(`profiles.secretPasscodeHash !== null`)。 */
  hasPasscode: boolean;
  /** 直近の操作のエラー(messageKey)。 */
  errorKey: string | null;
  /** 正しいパスコードなら unlocked=true にする。 */
  unlock: (passcode: string) => Promise<boolean>;
  /** パスコード不要で即座にロックへ戻す。 */
  lock: () => void;
  /** パスコードを新規設定/変更する(形式不正なら拒否)。 */
  setPasscode: (passcode: string) => Promise<boolean>;
  dismissError: () => void;
}

export const defaultSecretModeState: SecretModeState = {
  unlocked: false,
  hasPasscode: false,
  errorKey: null,
  unlock: async () => false,
  lock: () => {},
  setPasscode: async () => false,
  dismissError: () => {},
};

export const SecretModeContext = createContext<SecretModeState>(defaultSecretModeState);

export function useSecretMode(): SecretModeState {
  return useContext(SecretModeContext);
}
